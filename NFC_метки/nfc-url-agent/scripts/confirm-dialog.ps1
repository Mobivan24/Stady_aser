<#
  Native Windows confirmation dialog (OK/Cancel), always on top.
  ASCII-only on purpose: all user-visible text comes from Node.js as
  arguments, so Windows PowerShell 5.1 file encoding cannot break it.

  Exit codes: 0 = OK, 1 = Cancel/closed, 2 = script error.
#>
param(
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$Message
)

$ErrorActionPreference = 'Stop'

try {
  Add-Type -AssemblyName System.Windows.Forms

  $owner = New-Object System.Windows.Forms.Form
  $owner.TopMost = $true
  $owner.ShowInTaskbar = $false

  $result = [System.Windows.Forms.MessageBox]::Show(
    $owner,
    $Message,
    $Title,
    [System.Windows.Forms.MessageBoxButtons]::OKCancel,
    [System.Windows.Forms.MessageBoxIcon]::Question,
    [System.Windows.Forms.MessageBoxDefaultButton]::Button2
  )

  $owner.Dispose()

  if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    exit 0
  } else {
    exit 1
  }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 2
}
