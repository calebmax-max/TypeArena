$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = (Get-Command python).Source

Set-Location $root

& $python wsgi.py
