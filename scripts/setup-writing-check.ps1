$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot = Join-Path $taskRoot '.local-tools'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
if (Test-Path -LiteralPath (Join-Path $runtimeRoot 'writing-runtime.json')) {
  Write-Output 'Local Writing Check is already installed.'
  exit 0
}
Write-Output 'Downloading the local LanguageTool engine and a private Java runtime from their official sources...'
$assets = Invoke-RestMethod -Uri 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jre&os=windows'
$package = $assets[0].binary.package
if ($package.link -notmatch '^https://github\.com/adoptium/temurin17-binaries/releases/download/' -or $package.checksum -notmatch '^[a-f0-9]{64}$') { throw 'Unexpected Java download metadata.' }
$javaZip = Join-Path $runtimeRoot 'java.zip'
$toolZip = Join-Path $runtimeRoot 'languagetool.zip'
if (!(Test-Path -LiteralPath $javaZip)) { Invoke-WebRequest -Uri $package.link -OutFile $javaZip }
if ((Get-FileHash -LiteralPath $javaZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $package.checksum) { throw 'Java checksum did not match. Remove .local-tools/java.zip and retry.' }
if (!(Test-Path -LiteralPath $toolZip)) { Invoke-WebRequest -Uri 'https://languagetool.org/download/LanguageTool-6.6.zip' -OutFile $toolZip }
$javaDir = Join-Path $runtimeRoot 'java'
$toolDir = Join-Path $runtimeRoot 'languagetool'
Expand-Archive -LiteralPath $javaZip -DestinationPath $javaDir -Force
Expand-Archive -LiteralPath $toolZip -DestinationPath $toolDir -Force
$javaExecutable = Get-ChildItem -LiteralPath $javaDir -Filter java.exe -Recurse | Select-Object -First 1
$toolJar = Get-ChildItem -LiteralPath $toolDir -Filter languagetool-server.jar -Recurse | Select-Object -First 1
if (!$javaExecutable -or !$toolJar) { throw 'The downloaded runtime is incomplete.' }
$configPath = Join-Path $runtimeRoot 'server.properties'
@'
maxTextLength=20000
maxCheckTimeMillis=15000
cacheSize=0
maxWorkQueueSize=20
'@ | Set-Content -LiteralPath $configPath -Encoding utf8NoBOM
@{java=[IO.Path]::GetRelativePath($runtimeRoot,$javaExecutable.FullName); jar=[IO.Path]::GetRelativePath($runtimeRoot,$toolJar.FullName); config='server.properties'; languageToolVersion='6.6'; javaSHA256=$package.checksum} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeRoot 'writing-runtime.json') -Encoding utf8NoBOM
Remove-Item -LiteralPath $javaZip,$toolZip
Write-Output 'Local Writing Check is installed. Sanctum starts it when you check text. No cloud account is needed.'
