; Custom NSIS finish page for Strix.
; electron-builder lets us own the finish page via the customFinishPage macro.
; We keep the standard "run app" checkbox and repurpose NSIS's built-in
; "show readme" checkbox as an opt-in "Create a desktop shortcut" tick, so the
; user decides (instead of createDesktopShortcut:"always" doing it silently).

!macro customFinishPage
  ; Launch-app checkbox (checked by default).
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StrixRunAfterFinish"
  ; Desktop-shortcut checkbox (checked by default; user can untick).
  !define MUI_FINISHPAGE_SHOWREADME ""
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "Create a desktop shortcut"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION "StrixCreateDesktopShortcut"
  !insertmacro MUI_PAGE_FINISH
!macroend

Function StrixRunAfterFinish
  ; Exec (not ExecShell) launches the app as the de-elevated user.
  Exec '"$INSTDIR\${PRODUCT_NAME}.exe"'
FunctionEnd

Function StrixCreateDesktopShortcut
  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_NAME}.exe"
FunctionEnd
