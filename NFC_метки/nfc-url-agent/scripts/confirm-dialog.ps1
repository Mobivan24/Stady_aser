<#
  Показывает нативное окно подтверждения Windows с кнопками OK/Cancel.
  Используется browser.js для запроса подтверждения перед открытием
  URL, считанного с разрешённой NFC-метки.

  Код возврата: 0 = пользователь нажал "Открыть" (OK), 1 = "Отмена"
  либо окно было закрыто иным способом.
#>
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [Parameter(Mandatory = $true)][string]$Url
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$message = "Обнаружена разрешённая NFC-метка: $Name`r`nURL: $Url"
$title = "NFC URL Agent — подтверждение"

$result = [System.Windows.Forms.MessageBox]::Show(
  $message,
  $title,
  [System.Windows.Forms.MessageBoxButtons]::OKCancel,
  [System.Windows.Forms.MessageBoxIcon]::Question,
  [System.Windows.Forms.MessageBoxDefaultButton]::Button2
)

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  exit 0
} else {
  exit 1
}
