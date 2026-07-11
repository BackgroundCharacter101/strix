; Strix custom installer (Inno Setup). Wraps electron-builder's win-unpacked
; payload into a modern, per-user wizard with opt-in tasks.
;
; Compiled by scripts/edition.mjs via ISCC with these /D defines:
;   MyAppName   e.g. "Strix M1"            (product name, install dir, shortcuts)
;   MyAppId     stable GUID per edition     (upgrade/uninstall identity)
;   MyExe       e.g. "Strix M1.exe"         (the launcher in the payload)
;   MyVersion   e.g. 0.1.0
;   MySrcDir    ...\release\<ed>\win-unpacked   (electron-builder output)
;   MyIcon      ...\.icon-ico\icon.ico
;   MyOutDir    ...\release\<ed>            (where Setup.exe is written)
;   MyOutBase   e.g. "Strix M1 Setup 0.1.0"
;   MyLicense   ...\build\license.txt
;   MySidebar   ...\build\installerSidebar.bmp   (164x314)
;   MyHeader    ...\build\installerHeader.bmp     (150x57)

#ifndef MyAppName
  #define MyAppName "Strix M1"
#endif
#ifndef MyExe
  #define MyExe "Strix M1.exe"
#endif
#ifndef MyVersion
  #define MyVersion "0.1.0"
#endif
#ifndef MyEdition
  #define MyEdition "m1"
#endif
; Stable per-edition GUIDs so upgrades replace (not duplicate) the install.
#if MyEdition == "competition"
  #define MyAppId "{{B2E4D3C5-6F7C-58B9-AD1E-2F3A4B5C6D7E}"
#else
  #define MyAppId "{{A1F3C2D4-5E6B-47A8-9C0D-1E2F3A4B5C6D}"
#endif

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyVersion}
AppPublisher=Strix
; {autopf} is install-mode-aware: %LOCALAPPDATA%\Programs for a per-user install,
; Program Files for an all-users install — so one line serves both choices.
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableDirPage=no
; Inno 6 hides the Welcome page by default; show it so the glass art appears.
DisableWelcomePage=no
; Default to a per-USER install (%LOCALAPPDATA%\Programs, no UAC) — that's what
; makes live auto-update fully silent. `...OverridesAllowed=dialog` adds the
; "Install for all users / just me" chooser: picking all-users elevates (UAC)
; and installs into Program Files (that install then updates with one UAC per
; update — see main/ipc.ts update:apply).
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
; Let Inno close a running Strix (via Restart Manager) so a silent self-update
; can overwrite the in-use exe; we relaunch it ourselves from [Run].
CloseApplications=yes
RestartApplications=no
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
Compression=lzma2/ultra
SolidCompression=yes
SetupIconFile={#MyIcon}
UninstallDisplayIcon={app}\{#MyExe}
UninstallDisplayName={#MyAppName} {#MyVersion}
LicenseFile={#MyLicense}
WizardImageFile={#MySidebar}
WizardSmallImageFile={#MyHeader}
OutputDir={#MyOutDir}
OutputBaseFilename={#MyOutBase}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"
Name: "addtopath"; Description: "Add Strix to PATH (run ""strix"" from any terminal)"; GroupDescription: "Integration:"; Flags: unchecked
Name: "openwith"; Description: "Add ""Open with {#MyAppName}"" to the folder right-click menu"; GroupDescription: "Integration:"; Flags: unchecked

[Files]
Source: "{#MySrcDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyExe}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyExe}"; Tasks: desktopicon

[Registry]
; PATH (per-user): append the install dir so the strix.cmd shim is resolvable.
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; \
  ValueData: "{olddata};{app}"; Tasks: addtopath; Check: NeedsAddPath('{app}'); Flags: preservestringtype
; "Open with Strix" on folders + folder background (per-user, no admin).
Root: HKA; Subkey: "Software\Classes\Directory\shell\OpenWithStrix"; ValueType: string; ValueData: "Open with {#MyAppName}"; Tasks: openwith; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\Directory\shell\OpenWithStrix"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyExe}"; Tasks: openwith
Root: HKA; Subkey: "Software\Classes\Directory\shell\OpenWithStrix\command"; ValueType: string; ValueData: """{app}\{#MyExe}"" ""%1"""; Tasks: openwith
Root: HKA; Subkey: "Software\Classes\Directory\Background\shell\OpenWithStrix"; ValueType: string; ValueData: "Open with {#MyAppName}"; Tasks: openwith; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\Directory\Background\shell\OpenWithStrix"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyExe}"; Tasks: openwith
Root: HKA; Subkey: "Software\Classes\Directory\Background\shell\OpenWithStrix\command"; ValueType: string; ValueData: """{app}\{#MyExe}"" ""%V"""; Tasks: openwith

[Run]
; Interactive install: offer a "Launch now" checkbox on the finish page.
Filename: "{app}\{#MyExe}"; Description: "Launch {#MyAppName} now"; Flags: nowait postinstall skipifsilent
; Silent install (a live auto-update): relaunch Strix automatically once files
; are swapped, since there's no finish page to click.
Filename: "{app}\{#MyExe}"; Flags: nowait skipifnotsilent

[Code]
// Only append to PATH when our dir isn't already present.
function NeedsAddPath(Param: string): Boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
  begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + ExpandConstant(Param) + ';', ';' + OrigPath + ';') = 0;
end;

// Write a tiny `strix.cmd` shim into the install dir so `strix` / `strix .`
// launches the app (with the folder argument) from any terminal on PATH.
procedure CurStepChanged(CurStep: TSetupStep);
var
  Shim: string;
begin
  if (CurStep = ssPostInstall) and WizardIsTaskSelected('addtopath') then
  begin
    Shim := '@echo off' + #13#10 +
            '"' + ExpandConstant('{app}\{#MyExe}') + '" %*' + #13#10;
    SaveStringToFile(ExpandConstant('{app}\strix.cmd'), Shim, False);
  end;
end;
