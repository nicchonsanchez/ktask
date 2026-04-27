' Digita comando-por-comando na janela ativa via SendKeys.
' Util para o Console Hetzner que estraga o paste (caps invertido,
' simbolos viram outros chars). SendKeys envia keystrokes "como se
' o user tivesse digitado", o que funciona normal.
'
' Como usar:
' 1. Login no Console Hetzner como root (popup do navegador)
' 2. Volta no Windows e da double-click neste .vbs
' 3. Aparece dialog com o comando. Clica em "Sim"
' 4. Troca pra janela do Console (Alt+Tab, ou clica nela)
' 5. Aguarda 2s — VBS digita o comando (sem Enter no final)
' 6. VOCE revisa o que foi digitado e aperta Enter no Console
' 7. Volta no Windows e clica "OK" no dialog "Pronto?" pra ir pro proximo

Option Explicit

Dim sh, commands, cmd, answer, i, ch, escaped, total
Set sh = WScript.CreateObject("WScript.Shell")

commands = Array( _
    "echo ""kops ALL=(ALL) NOPASSWD:ALL"" > /etc/sudoers.d/kops", _
    "chmod 440 /etc/sudoers.d/kops", _
    "echo ""ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIE/vLsDS573Ydgds3p7rRybRx9SHnK/jb+Z48MldQJv desenvolvimento@agenciakharis.com.br"" > /home/kops/.ssh/authorized_keys", _
    "chmod 600 /home/kops/.ssh/authorized_keys", _
    "chown -R kops:kops /home/kops/.ssh", _
    "ls -la /home/kops/.ssh/" _
)

total = UBound(commands) + 1

For i = 0 To UBound(commands)
    cmd = commands(i)

    answer = MsgBox( _
        "Comando " & (i + 1) & " de " & total & ":" & vbCrLf & vbCrLf & _
        cmd & vbCrLf & vbCrLf & _
        "Clica SIM e DEPOIS coloca a janela do Console em foco (Alt+Tab)." & vbCrLf & _
        "VBS espera 2s e digita sozinho. VOCE revisa e aperta Enter no Console.", _
        4 + 32 + 256, _
        "Pode colar? (" & (i + 1) & "/" & total & ")" _
    )

    If answer = 7 Then
        ' Clicou em Nao -> sai
        MsgBox "Cancelado.", 48, "Cancelado"
        WScript.Quit
    End If

    WScript.Sleep 2000

    Dim j
    For j = 1 To Len(cmd)
        ch = Mid(cmd, j, 1)
        Select Case ch
            Case "("
                escaped = "{(}"
            Case ")"
                escaped = "{)}"
            Case "+"
                escaped = "{+}"
            Case "^"
                escaped = "{^}"
            Case "%"
                escaped = "{%}"
            Case "~"
                escaped = "{~}"
            Case "{"
                escaped = "{{}"
            Case "}"
                escaped = "{}}"
            Case "["
                escaped = "{[}"
            Case "]"
                escaped = "{]}"
            Case Else
                escaped = ch
        End Select
        sh.SendKeys escaped
        WScript.Sleep 30
    Next

    ' NAO manda Enter — user revisa e aperta manualmente no Console.
    ' Espera o user dar OK aqui antes de mostrar o proximo dialog.
    MsgBox _
        "Comando " & (i + 1) & " digitado." & vbCrLf & _
        "Revise no Console e aperte Enter LA pra executar." & vbCrLf & vbCrLf & _
        "Quando estiver pronto pro proximo, clique OK aqui.", _
        64 + 256, _
        "Pronto? (" & (i + 1) & "/" & total & ")"
Next

MsgBox "Todos os " & total & " comandos foram digitados." & vbCrLf & _
       "Confere o output do ultimo (ls -la) no Console.", _
       64, "Concluido"
