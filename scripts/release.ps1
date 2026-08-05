<#
.SYNOPSIS
  MD Reader release automation script.

.DESCRIPTION
  Automates the full release flow: version bump, build, zip, git tag/push,
  draft GitHub Release with assets, rename assets, wait for CI, publish.

.PARAMETER Version
  Version number without 'v' prefix, e.g. "0.3.5".

.PARAMETER NotesFile
  Path to a markdown file containing release notes (features/fixes).
  Standard download instructions are appended automatically.

.EXAMPLE
  .\scripts\release.ps1 -Version 0.3.5 -NotesFile .\release-notes.md
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [Parameter(Mandatory = $true)]
    [string]$NotesFile
)

$ErrorActionPreference = "Stop"
$tag = "v$Version"
$exePath = "src-tauri\target\release\md-reader.exe"
$msiPath = "src-tauri\target\release\bundle\msi\MD Reader_$Version`_x64_en-US.msi"
$zipPath = "src-tauri\target\release\md-reader-portable.zip"

function Write-Step($num, $msg) {
    Write-Host ""
    Write-Host "[$num/10] $msg" -ForegroundColor Cyan
}

# ── Step 1: Prerequisites ──────────────────────────────────────────────
Write-Step 1 "Checking prerequisites..."

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "gh CLI not found. Install GitHub CLI first."
}
if (-not (Test-Path $NotesFile)) {
    throw "Notes file not found: $NotesFile"
}

$dirty = git status --porcelain
$changelogDirty = git status --porcelain CHANGELOG.md
if ($dirty -and $dirty -ne $changelogDirty) {
    Write-Host "  Warning: working tree has uncommitted changes besides CHANGELOG.md" -ForegroundColor Yellow
    Write-Host "  Continue? (y/N)" -ForegroundColor Yellow
    $confirm = Read-Host
    if ($confirm -ne "y" -and $confirm -ne "Y") { throw "Aborted by user." }
}
if (-not $changelogDirty) {
    Write-Host "  Warning: CHANGELOG.md not modified. Did you forget to update it?" -ForegroundColor Yellow
}

# ── Step 2: Version bump ───────────────────────────────────────────────
Write-Step 2 "Updating version to $Version ..."

$bumpFile = {
    param($path, $pattern, $replacement)
    $c = [System.IO.File]::ReadAllText($path)
    $c = $c -replace $pattern, $replacement
    [System.IO.File]::WriteAllText($path, $c)
}

& $bumpFile "package.json" '"version":\s*"[^"]*"' ('"version": "' + $Version + '"')
& $bumpFile "src-tauri\tauri.conf.json" '"version":\s*"[^"]*"' ('"version": "' + $Version + '"')
& $bumpFile "src-tauri\Cargo.toml" '(?m)^version = "[^"]*"' ('version = "' + $Version + '"')
Write-Host "  Done."

# ── Step 3: Stop running process ───────────────────────────────────────
Write-Step 3 "Stopping md-reader process..."
Get-Process -Name "md-reader" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "  Done."

# ── Step 4: Build MSI ──────────────────────────────────────────────────
Write-Step 4 "Building MSI..."
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
$ErrorActionPreference = "Continue"
& ".\node_modules\.bin\tauri.cmd" build --bundles msi 2>&1 | ForEach-Object { Write-Host $_ }
$buildExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($buildExit -ne 0) { throw "Build failed." }
if (-not (Test-Path $exePath)) { throw "exe not found: $exePath" }
if (-not (Test-Path $msiPath)) { throw "MSI not found: $msiPath" }
Write-Host "  Build OK."

# ── Step 5: Create zip ─────────────────────────────────────────────────
Write-Step 5 "Creating portable zip..."
Compress-Archive -Path $exePath -DestinationPath $zipPath -Force
if (-not (Test-Path $zipPath)) { throw "Zip not found: $zipPath" }
Write-Host "  Done."

# ── Step 6: Git commit + tag ───────────────────────────────────────────
Write-Step 6 "Git commit, tag, push..."
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock CHANGELOG.md
git commit -m "chore: release $tag"
git push origin main
git tag $tag
git push origin $tag
Write-Host "  Pushed $tag."

# ── Step 7: Create draft release ───────────────────────────────────────
Write-Step 7 "Creating draft release..."

$notesContent = [System.IO.File]::ReadAllText($NotesFile)
$downloadNotes = [System.IO.File]::ReadAllText("$PSScriptRoot\download-notes.md")
$fullNotes = $notesContent.TrimEnd() + "`n" + $downloadNotes.TrimStart()
$tempNotes = ".release-notes-tmp.md"
[System.IO.File]::WriteAllText($tempNotes, $fullNotes)

gh release create $tag $exePath $msiPath $zipPath `
    --title "MD Reader $tag" --notes-file $tempNotes --draft
Remove-Item $tempNotes -Force
Write-Host "  Draft release created."

# ── Step 8: Rename assets ──────────────────────────────────────────────
Write-Step 8 "Renaming assets..."

$assets = gh release view $tag --json assets | ConvertFrom-Json | Select-Object -ExpandProperty assets

$exeAsset = $assets | Where-Object { $_.name -eq "md-reader.exe" }
$msiAsset = $assets | Where-Object { $_.name -like "MD.Reader*$Version*x64*msi" }
$zipAsset = $assets | Where-Object { $_.name -eq "md-reader-portable.zip" }

$rename = {
    param($asset, $newName)
    if ($asset) {
        $id = ($asset.apiUrl -split '/')[-1]
        gh api --method PATCH "repos/Neilooo/md-reader/releases/assets/$id" -f name=$newName | Out-Null
        Write-Host "  $($asset.name) -> $newName"
    }
}

& $rename $exeAsset "MD-Reader-$Version-windows-x64-portable.exe"
& $rename $msiAsset "MD-Reader-$Version-windows-x64-setup.msi"
& $rename $zipAsset "MD-Reader-$Version-windows-x64-portable.zip"
Write-Host "  All assets renamed."

# ── Step 9: Wait for CI ────────────────────────────────────────────────
Write-Step 9 "Waiting for CI..."
$runJson = gh run list --workflow release.yml --limit 1 --json databaseId | ConvertFrom-Json
$runId = $runJson[0].databaseId
Write-Host "  CI run ID: $runId"

$ciOk = $false
try {
    gh run watch $runId --exit-status --interval 30 2>&1 | Out-Null
    $ciOk = $true
} catch {
    Write-Host "  gh run watch failed, falling back to polling..." -ForegroundColor Yellow
    for ($i = 0; $i -lt 120; $i++) {
        Start-Sleep -Seconds 30
        $st = gh run view $runId --json status,conclusion 2>&1 | ConvertFrom-Json
        if ($st.status -eq "completed") {
            if ($st.conclusion -eq "success") { $ciOk = $true }
            break
        }
    }
}
if (-not $ciOk) { throw "CI did not succeed. Release remains as draft." }
Write-Host "  CI passed."

# ── Step 10: Publish ───────────────────────────────────────────────────
Write-Step 10 "Publishing release..."
gh release edit $tag --draft=false --prerelease=false
$url = gh release view $tag --json url | ConvertFrom-Json | Select-Object -ExpandProperty url
Write-Host ""
Write-Host "  Published: $url" -ForegroundColor Green
