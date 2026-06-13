Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = "y:\내 드라이브\AI\안티그래비티\hwpview"
objShell.Run "node server.js", 0, False
