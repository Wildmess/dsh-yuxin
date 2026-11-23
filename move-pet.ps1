param([int]$x = 1100, [int]$y = 300)
$p = Get-Process -Name 'electron' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match '桌宠' } | Select-Object -First 1
if (-not $p) { Write-Output 'window not found'; exit 1 }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class PetMove2 {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
'@
[PetMove2]::SetWindowPos($p.MainWindowHandle, [IntPtr]::Zero, $x, $y, 0, 0, 0x0001 -bor 0x0004) | Out-Null
Write-Output "moved to $x,$y"
