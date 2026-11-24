Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
rootDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = rootDir
WshShell.Run "node """ & rootDir & "\scripts\launch-windows.mjs""", 0, False
