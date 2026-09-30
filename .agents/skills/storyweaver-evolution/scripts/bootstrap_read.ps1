param([Parameter(Mandatory=$true)][string]$InputPath)
Get-Content -LiteralPath $InputPath -Raw
