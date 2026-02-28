param($Port = 3033)

$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    $procId = $conn.OwningProcess
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($proc) {
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$procId").CommandLine
            if ($cmd -match 'server.js') {
                Write-Output "FOUND_SERVER $procId"
                exit 0
            } else {
                Write-Output "OTHER_PROCESS $procId"
                exit 1
            }
        } catch {
            Write-Output "OTHER_PROCESS $procId"
            exit 1
        }
    }
}
Write-Output "PORT_FREE"
exit 0
