// Windows shell interop for iconwright: shortcuts (.lnk + AppUserModelID),
// the taskbar pin list (Taskband registry), the desktop folder view, and refresh helpers.
// Loaded by iconwright.ps1 via Add-Type. PowerShell 5.1 / C# 5 compatible.
using System;
using System.Runtime.InteropServices;
using System.Text;

namespace Iconwright {

  // ---------- Taskbar pinned list (shell32 "Taskband Pin", undocumented) ----------
  // Read methods work from any process. Write methods (Modify/LegacyModify) are
  // silently ignored unless the caller is explorer.exe, so pinning writes the
  // Taskband registry instead (see docs/windows-taskbar.md). Used for diagnostics.
  [ComImport, Guid("0DD79AE2-D156-45D4-9EEB-3B549769E940"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPinnedList3 {
    [PreserveSig] int EnumObjects(out IntPtr ppEnum);
    [PreserveSig] int GetPinnableInfo(IntPtr dataObj, int flags, IntPtr a, IntPtr b, IntPtr c, IntPtr d);
    [PreserveSig] int IsPinnable(IntPtr dataObj, int flags);
    [PreserveSig] int Resolve(IntPtr hwnd, int flags, IntPtr pidl, out IntPtr resolved);
    [PreserveSig] int LegacyModify(IntPtr unpin, IntPtr pin);
    [PreserveSig] int GetChangeCount(out uint count);
    [PreserveSig] int IsPinned(IntPtr pidl);
  }

  public static class PinnedList {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern IntPtr ILCreateFromPathW(string path);
    [DllImport("shell32.dll")] static extern void ILFree(IntPtr pidl);

    static IPinnedList3 List() {
      return (IPinnedList3)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("90AA3A4E-1CBA-4233-B8BB-535773D48449")));
    }
    public static bool IsPinned(string path) {
      IntPtr p = ILCreateFromPathW(path);
      if (p == IntPtr.Zero) throw new ArgumentException("Path not found: " + path);
      try { return List().IsPinned(p) == 0; } finally { ILFree(p); }
    }
    public static uint ChangeCount() {
      uint c; Marshal.ThrowExceptionForHR(List().GetChangeCount(out c)); return c;
    }
  }

  // ---------- Shortcuts ----------
  [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder f, int c, IntPtr fd, uint fl);
    void GetIDList(out IntPtr p); void SetIDList(IntPtr p);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int c);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string s);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int c);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string s);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int c);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string s);
    void GetHotkey(out short h); void SetHotkey(short h);
    void GetShowCmd(out int n); void SetShowCmd(int n);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int c, out int i);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string s, int i);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string s, uint r);
    void Resolve(IntPtr hwnd, uint f);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string s);
  }
  [ComImport, Guid("0000010b-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPersistFile {
    void GetClassID(out Guid g); [PreserveSig] int IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string f, uint mode);
    void Save([MarshalAs(UnmanagedType.LPWStr)] string f, [MarshalAs(UnmanagedType.Bool)] bool remember);
    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string f);
    void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string f);
  }
  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct PROPERTYKEY { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Explicit, Size = 16)]
  public struct PROPVARIANT { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPropertyStore {
    void GetCount(out uint c); void GetAt(uint i, out PROPERTYKEY k);
    void GetValue(ref PROPERTYKEY k, out PROPVARIANT v);
    void SetValue(ref PROPERTYKEY k, ref PROPVARIANT v);
    void Commit();
  }

  public static class Lnk {
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT pv);
    static IShellLinkW New() {
      return (IShellLinkW)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("00021401-0000-0000-C000-000000000046")));
    }
    static IShellLinkW Open(string lnkPath, uint mode) { var l = New(); ((IPersistFile)l).Load(lnkPath, mode); return l; }

    // Create or overwrite a shortcut. args/workDir/icon/appId/description may be null.
    public static void Save(string lnkPath, string target, string args, string workDir,
                            string icon, int iconIndex, string appId, string description) {
      var link = New();
      link.SetPath(target);
      if (args != null) link.SetArguments(args);
      if (workDir != null) link.SetWorkingDirectory(workDir);
      if (icon != null) link.SetIconLocation(icon, iconIndex);
      if (description != null) link.SetDescription(description);
      if (appId != null) {
        // PKEY_AppUserModel_ID: groups the pinned shortcut with the app's running windows.
        var key = new PROPERTYKEY(); key.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"); key.pid = 5;
        var pv = new PROPVARIANT(); pv.vt = 31 /*VT_LPWSTR*/; pv.p = Marshal.StringToCoTaskMemUni(appId);
        var store = (IPropertyStore)link; store.SetValue(ref key, ref pv); store.Commit(); PropVariantClear(ref pv);
      }
      ((IPersistFile)link).Save(lnkPath, true);
    }
    // Stamp an AppUserModelID onto an existing shortcut. Explorer needs one on every pinned
    // item: for shortcuts without one it stores a computed ID inside the pin entry, which
    // pins written directly to the registry lack (they then silently don't show).
    public static void SetAppId(string lnkPath, string appId) {
      var link = Open(lnkPath, 2 /*STGM_READWRITE*/);
      var key = new PROPERTYKEY(); key.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"); key.pid = 5;
      var pv = new PROPVARIANT(); pv.vt = 31; pv.p = Marshal.StringToCoTaskMemUni(appId);
      var store = (IPropertyStore)link; store.SetValue(ref key, ref pv); store.Commit(); PropVariantClear(ref pv);
      ((IPersistFile)link).Save(lnkPath, true);
    }
    // Change only the icon of an existing shortcut; keeps target, AppID, etc.
    public static void SetIcon(string lnkPath, string icon, int iconIndex) {
      var link = Open(lnkPath, 2 /*STGM_READWRITE*/);
      link.SetIconLocation(icon, iconIndex);
      ((IPersistFile)link).Save(lnkPath, true);
    }
    public static string GetTarget(string lnkPath) {
      var sb = new StringBuilder(1024); Open(lnkPath, 0).GetPath(sb, sb.Capacity, IntPtr.Zero, 0); return sb.ToString();
    }
    public static string GetIcon(string lnkPath) {
      var sb = new StringBuilder(1024); int i; Open(lnkPath, 0).GetIconLocation(sb, sb.Capacity, out i);
      return sb.Length == 0 ? "" : sb.ToString() + "," + i;
    }
  }

  // ---------- Explorer-hosted Shell.Application ----------
  [ComImport, Guid("85CB6900-4D95-11CF-960C-0080C7F4EE85"), InterfaceType(ComInterfaceType.InterfaceIsIDispatch)]
  public interface IShellWindows {
    [DispId(0x60020000)] int Count { get; }
    [DispId(0)] [return: MarshalAs(UnmanagedType.IDispatch)] object Item([MarshalAs(UnmanagedType.Struct)] object index);
    [DispId(-4)] [return: MarshalAs(UnmanagedType.IUnknown)] object _NewEnum();
    [DispId(0x60020003)] void Register([MarshalAs(UnmanagedType.IDispatch)] object d, int hwnd, int swClass, out int cookie);
    [DispId(0x60020004)] void RegisterPending(int tid, ref object root, ref object pidl, int swClass, out int cookie);
    [DispId(0x60020005)] void Revoke(int cookie);
    [DispId(0x60020006)] void OnNavigate(int cookie, ref object loc);
    [DispId(0x60020007)] void OnActivated(int cookie, bool active);
    [DispId(0x60020008)] [return: MarshalAs(UnmanagedType.IDispatch)]
    object FindWindowSW(ref object loc, ref object root, int swClass, out int hwnd, int swfwOptions);
  }
  [ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IServiceProvider {
    [PreserveSig] int QueryService(ref Guid sid, ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  }
  [ComImport, Guid("000214E2-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IShellBrowser {
    void GetWindow(out IntPtr h); void ContextSensitiveHelp(bool b);
    void InsertMenusSB(IntPtr a, IntPtr b); void SetMenuSB(IntPtr a, IntPtr b, IntPtr c); void RemoveMenusSB(IntPtr a);
    void SetStatusTextSB(IntPtr a); void EnableModelessSB(bool b); void TranslateAcceleratorSB(IntPtr a, short b);
    void BrowseObject(IntPtr a, uint b); void GetViewStateStream(uint a, out IntPtr b); void GetControlWindow(uint a, out IntPtr b);
    void SendControlMsg(uint a, uint b, IntPtr c, IntPtr d, IntPtr e);
    void QueryActiveShellView([MarshalAs(UnmanagedType.Interface)] out IShellView v);
  }
  [ComImport, Guid("000214E3-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IShellView {
    void GetWindow(out IntPtr h); void ContextSensitiveHelp(bool b);
    [PreserveSig] int TranslateAccelerator(IntPtr m); void EnableModeless(bool b); void UIActivate(uint s); void Refresh();
    void CreateViewWindow(IntPtr a, IntPtr b, IntPtr c, IntPtr d, out IntPtr e); void DestroyViewWindow();
    void GetCurrentInfo(IntPtr a); void AddPropertySheetPages(uint a, IntPtr b, IntPtr c); void SaveViewState();
    void SelectItem(IntPtr a, uint b);
    void GetItemObject(uint item, ref Guid iid, [MarshalAs(UnmanagedType.IDispatch)] out object o);
  }

  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }

  // IFolderView + IFolderView2 methods in vtable order (C# needs base methods redeclared).
  [ComImport, Guid("1af3a467-214f-4298-908e-06b03e0b39f9"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IFolderView2 {
    void GetCurrentViewMode(out uint mode);
    void SetCurrentViewMode(uint mode);
    void GetFolder(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
    void Item(int index, out IntPtr pidl);
    void ItemCount(uint flags, out int count);
    void Items(uint flags, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
    void GetSelectionMarkedItem(out int i);
    void GetFocusedItem(out int i);
    void GetItemPosition(IntPtr pidl, out POINT pt);
    void GetSpacing(ref POINT pt);
    void GetDefaultSpacing(out POINT pt);
    [PreserveSig] int GetAutoArrange();
    void SelectItem(int i, uint flags);
    void SelectAndPositionItems(uint cidl, [MarshalAs(UnmanagedType.LPArray)] IntPtr[] apidl,
                                [MarshalAs(UnmanagedType.LPArray)] POINT[] apt, uint flags);
    // IFolderView2
    void SetGroupBy(IntPtr key, bool asc);
    void GetGroupBy(IntPtr key, out bool asc);
    void SetViewProperty(IntPtr pidl, IntPtr key, IntPtr pv);
    void GetViewProperty(IntPtr pidl, IntPtr key, IntPtr pv);
    void SetTileViewProperties(IntPtr pidl, [MarshalAs(UnmanagedType.LPWStr)] string s);
    void SetExtendedTileViewProperties(IntPtr pidl, [MarshalAs(UnmanagedType.LPWStr)] string s);
    void SetText(int type, [MarshalAs(UnmanagedType.LPWStr)] string s);
    void SetCurrentFolderFlags(uint mask, uint flags);
    void GetCurrentFolderFlags(out uint flags);
    void GetSortColumnCount(out int c);
    void SetSortColumns(IntPtr cols, int c);
    void GetSortColumns(IntPtr cols, int c);
    void GetItem(int i, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
    void GetVisibleItem(int start, bool previous, out int i);
    void GetSelectedItem(int start, out int i);
    void GetSelection(bool none, out IntPtr arr);
    void GetSelectionState(IntPtr pidl, out uint flags);
    void InvokeVerbOnSelection([MarshalAs(UnmanagedType.LPStr)] string verb);
    void SetViewModeAndIconSize(int mode, int size);
    void GetViewModeAndIconSize(out int mode, out int size);
  }

  public class DesktopItem {
    public string name; public string path; public int x; public int y;
  }

  // Live control of the desktop's icons through explorer's own folder view.
  // Changes apply immediately; SaveState() persists them (explorer otherwise saves on exit).
  public static class Desktop {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern int SHGetNameFromIDList(IntPtr pidl, uint sigdn, out IntPtr name);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool SystemParametersInfoW(uint a, uint b, ref RECT r, uint c);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }

    const uint FWF_AUTOARRANGE = 0x1, FWF_NOICONS = 0x1000, FWF_SNAPTOGRID = 0x80000;

    static IFolderView2 View() { return (IFolderView2)ExplorerShell.DesktopView(); }
    static string Name(IntPtr pidl, uint sigdn) {
      IntPtr p; if (SHGetNameFromIDList(pidl, sigdn, out p) != 0) return null;
      try { return Marshal.PtrToStringUni(p); } finally { Marshal.FreeCoTaskMem(p); }
    }

    public static DesktopItem[] List() {
      var v = View(); int n; v.ItemCount(2 /*SVGIO_ALLVIEW*/, out n);
      var items = new DesktopItem[n];
      for (int i = 0; i < n; i++) {
        IntPtr pidl; v.Item(i, out pidl);
        try {
          POINT pt; v.GetItemPosition(pidl, out pt);
          items[i] = new DesktopItem { name = Name(pidl, 0 /*NORMALDISPLAY*/),
            path = Name(pidl, 0x80028000 /*DESKTOPABSOLUTEPARSING*/), x = pt.X, y = pt.Y };
        } finally { Marshal.FreeCoTaskMem(pidl); }
      }
      return items;
    }

    // Moves items (matched by display name or parsing path) to the given points.
    // Turns auto-arrange off first (it would undo the move). Returns how many moved.
    public static int Move(string[] keys, int[] xs, int[] ys) {
      var v = View(); SetFlags(FWF_AUTOARRANGE, false);
      int n; v.ItemCount(2, out n);
      var pidls = new System.Collections.Generic.List<IntPtr>(); var pts = new System.Collections.Generic.List<POINT>();
      try {
        for (int i = 0; i < n; i++) {
          IntPtr pidl; v.Item(i, out pidl);
          string name = Name(pidl, 0), path = Name(pidl, 0x80028000);
          int k = Array.FindIndex(keys, s => string.Equals(s, name, StringComparison.OrdinalIgnoreCase) ||
                                             string.Equals(s, path, StringComparison.OrdinalIgnoreCase));
          if (k < 0) { Marshal.FreeCoTaskMem(pidl); continue; }
          pidls.Add(pidl); pts.Add(new POINT { X = xs[k], Y = ys[k] });
        }
        if (pidls.Count > 0) v.SelectAndPositionItems((uint)pidls.Count, pidls.ToArray(), pts.ToArray(), 0x80 /*SVSI_POSITIONITEM*/);
        return pidls.Count;
      } finally { foreach (var p in pidls) Marshal.FreeCoTaskMem(p); }
    }

    public static int GetIconSize() { int m, s; View().GetViewModeAndIconSize(out m, out s); return s; }
    public static void SetIconSize(int px) { View().SetViewModeAndIconSize(1 /*FVM_ICON*/, px); }

    static void SetFlags(uint mask, bool on) { View().SetCurrentFolderFlags(mask, on ? mask : 0); }
    static bool GetFlag(uint mask) { uint f; View().GetCurrentFolderFlags(out f); return (f & mask) != 0; }
    public static bool AutoArrange { get { return GetFlag(FWF_AUTOARRANGE); } set { SetFlags(FWF_AUTOARRANGE, value); } }
    public static bool SnapToGrid { get { return GetFlag(FWF_SNAPTOGRID); } set { SetFlags(FWF_SNAPTOGRID, value); } }
    public static bool IconsVisible { get { return !GetFlag(FWF_NOICONS); } set { SetFlags(FWF_NOICONS, !value); } }

    public static POINT Spacing() { var p = new POINT(); View().GetSpacing(ref p); return p; }
    // Primary monitor work area, in desktop view coordinates.
    public static RECT WorkArea() { return Monitors()[0]; }

    [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor, rcWork; public uint dwFlags; }
    delegate bool MonitorEnum(IntPtr hMon, IntPtr hdc, ref RECT clip, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnum cb, IntPtr data);
    [DllImport("user32.dll")] static extern bool GetMonitorInfoW(IntPtr hMon, ref MONITORINFO mi);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);

    // Work area of every monitor (primary first), in desktop view coordinates: the desktop
    // view spans the whole virtual screen, so its origin is the virtual screen's top-left.
    public static RECT[] Monitors() {
      SetProcessDPIAware();
      int ox = GetSystemMetrics(76 /*SM_XVIRTUALSCREEN*/), oy = GetSystemMetrics(77 /*SM_YVIRTUALSCREEN*/);
      var list = new System.Collections.Generic.List<RECT>(); int primary = 0;
      EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr h, IntPtr dc, ref RECT clip, IntPtr d) => {
        var mi = new MONITORINFO { cbSize = Marshal.SizeOf(typeof(MONITORINFO)) };
        if (GetMonitorInfoW(h, ref mi)) {
          if ((mi.dwFlags & 1 /*MONITORINFOF_PRIMARY*/) != 0) primary = list.Count;
          list.Add(new RECT { L = mi.rcWork.L - ox, T = mi.rcWork.T - oy, R = mi.rcWork.R - ox, B = mi.rcWork.B - oy });
        }
        return true;
      }, IntPtr.Zero);
      if (list.Count == 0) { var r = new RECT(); SystemParametersInfoW(0x30 /*SPI_GETWORKAREA*/, 0, ref r, 0); list.Add(r); }
      if (primary > 0) { var p = list[primary]; list.RemoveAt(primary); list.Insert(0, p); }
      return list.ToArray();
    }
    // Ask explorer to persist the desktop layout now (it otherwise only saves on a clean exit).
    public static void SaveState() { ExplorerShell.DesktopView().SaveViewState(); }
  }

  public static class ExplorerShell {
    static IShellView cachedView;
    // FindWindowSW(SWC_DESKTOP) intermittently returns null (seen right after explorer
    // restarts and around the lock screen), so retry with backoff and reuse a live view.
    public static IShellView DesktopView() {
      if (cachedView != null) {
        try { IntPtr h; cachedView.GetWindow(out h); if (h != IntPtr.Zero) return cachedView; } catch { }
        cachedView = null;
      }
      for (int attempt = 0; ; attempt++) {
        try { return cachedView = FindDesktopView(); }
        catch (InvalidOperationException) { if (attempt >= 8) throw; System.Threading.Thread.Sleep(150 * (attempt + 1)); }
      }
    }
    static IShellView FindDesktopView() {
      var sw = (IShellWindows)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("9BA05972-F6A8-11CF-A442-00A0C90A8F39")));
      object loc = 0, root = Type.Missing; int hwnd;
      object disp = sw.FindWindowSW(ref loc, ref root, 8 /*SWC_DESKTOP*/, out hwnd, 1 /*SWFO_NEEDDISPATCH*/);
      if (disp == null) throw new InvalidOperationException("Explorer desktop window not found");
      Guid sid = new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837"), iid = typeof(IShellBrowser).GUID; object b;
      Marshal.ThrowExceptionForHR(((IServiceProvider)disp).QueryService(ref sid, ref iid, out b));
      IShellView view; ((IShellBrowser)b).QueryActiveShellView(out view);
      return view;
    }
  }

  // ---------- Taskband registry (persistent pin list) ----------
  // HKCU\...\Explorer\Taskband:
  //   Favorites        = { 0x00, uint32 cb, PIDL[cb] }* 0xFF
  //   FavoritesResolve = { uint32 cb, lnkBytes[cb] }*      (same order as Favorites)
  // Explorer only reads this at startup, so callers must stop explorer before writing
  // and start it afterwards (otherwise explorer may overwrite the change).
  public static class Taskband {
    const string Key = @"Software\Microsoft\Windows\CurrentVersion\Explorer\Taskband";
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern int SHParseDisplayName(string name, IntPtr bc, out IntPtr pidl, uint sfgao, out uint attr);
    [DllImport("shell32.dll")] static extern uint ILGetSize(IntPtr pidl);
    [DllImport("shell32.dll")] static extern IntPtr ILFindLastID(IntPtr pidl);
    [DllImport("shell32.dll")] static extern void ILFree(IntPtr pidl);

    public static string PinnedFolder() {
      return Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData) +
             @"\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar";
    }
    static byte[] Copy(IntPtr p) { int n = (int)ILGetSize(p); var b = new byte[n]; Marshal.Copy(p, b, 0, n); return b; }
    static byte[] Parse(string path, bool lastOnly) {
      IntPtr p; uint a; Marshal.ThrowExceptionForHR(SHParseDisplayName(path, IntPtr.Zero, out p, 0, out a));
      try { return Copy(lastOnly ? ILFindLastID(p) : p); } finally { ILFree(p); }
    }
    // Lenient split, for reading. Writers use Strict() so an unfamiliar layout is never
    // rewritten (a partial parse would silently drop the remaining pins).
    static System.Collections.Generic.List<byte[]> Split(byte[] fav, bool resolve) {
      bool complete; return Split(fav, resolve, out complete);
    }
    static System.Collections.Generic.List<byte[]> Split(byte[] fav, bool resolve, out bool complete) {
      var list = new System.Collections.Generic.List<byte[]>(); int o = 0;
      complete = true;
      if (fav == null) return list;
      complete = false;
      while (o < fav.Length) {
        if (!resolve) { if (fav[o] == 0xFF) { complete = o == fav.Length - 1; return list; } if (fav[o] != 0) return list; o += 1; }
        if (o + 4 > fav.Length) return list;
        int cb = BitConverter.ToInt32(fav, o); o += 4;
        if (cb <= 0 || o + cb > fav.Length) return list;
        var e = new byte[cb]; Buffer.BlockCopy(fav, o, e, 0, cb); list.Add(e); o += cb;
      }
      complete = resolve && o == fav.Length;
      return list;
    }
    static void Strict(Microsoft.Win32.RegistryKey k, out System.Collections.Generic.List<byte[]> favs, out System.Collections.Generic.List<byte[]> res) {
      bool a, b;
      favs = Split(k.GetValue("Favorites") as byte[], false, out a);
      res = Split(k.GetValue("FavoritesResolve") as byte[], true, out b);
      if (!a || !b || favs.Count != res.Count)
        throw new InvalidOperationException("The taskbar pin list (Taskband registry) has a layout iconwright does not recognize; not changing it.");
    }
    // True when the pin list parses completely (what writers require).
    public static bool Valid() {
      using (var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(Key)) {
        if (k == null) return false;
        try { System.Collections.Generic.List<byte[]> f, r; Strict(k, out f, out r); return true; } catch (InvalidOperationException) { return false; }
      }
    }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern bool SHGetPathFromIDListW(IntPtr pidl, StringBuilder path);
    static string PathOf(byte[] pidl) {
      IntPtr p = Marshal.AllocCoTaskMem(pidl.Length);
      try { Marshal.Copy(pidl, 0, p, pidl.Length); var sb = new StringBuilder(1024);
            return SHGetPathFromIDListW(p, sb) ? sb.ToString() : null; }
      finally { Marshal.FreeCoTaskMem(p); }
    }
    static void Write(Microsoft.Win32.RegistryKey k, System.Collections.Generic.List<byte[]> favs, System.Collections.Generic.List<byte[]> res) {
      var f = new System.IO.MemoryStream(); var r = new System.IO.MemoryStream();
      foreach (var e in favs) { f.WriteByte(0); f.Write(BitConverter.GetBytes(e.Length), 0, 4); f.Write(e, 0, e.Length); }
      f.WriteByte(0xFF);
      foreach (var e in res) { r.Write(BitConverter.GetBytes(e.Length), 0, 4); r.Write(e, 0, e.Length); }
      k.SetValue("Favorites", f.ToArray(), Microsoft.Win32.RegistryValueKind.Binary);
      k.SetValue("FavoritesResolve", r.ToArray(), Microsoft.Win32.RegistryValueKind.Binary);
      object ch = k.GetValue("FavoritesChanges");
      k.SetValue("FavoritesChanges", (ch is int ? (int)ch : 0) + 1, Microsoft.Win32.RegistryValueKind.DWord);
      if (k.GetValue("FavoritesVersion") == null) k.SetValue("FavoritesVersion", 3, Microsoft.Win32.RegistryValueKind.DWord);
    }
    // Paths of all pinned items, in taskbar order.
    public static string[] List() {
      using (var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(Key)) {
        if (k == null) return new string[0];
        var favs = Split(k.GetValue("Favorites") as byte[], false);
        var o = new string[favs.Count]; for (int i = 0; i < favs.Count; i++) o[i] = PathOf(favs[i]); return o;
      }
    }
    // Re-caches the shortcut bytes for lnkPath (after its icon changed). Returns false if not pinned.
    public static bool Sync(string lnkPath) { return Edit(lnkPath, false); }
    // Removes lnkPath from the pin list. Returns false if it was not pinned.
    public static bool Remove(string lnkPath) { return Edit(lnkPath, true); }
    static bool Edit(string lnkPath, bool remove) {
      string full = System.IO.Path.GetFullPath(lnkPath); bool hit = false;
      using (var k = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(Key)) {
        System.Collections.Generic.List<byte[]> favs, res; Strict(k, out favs, out res);
        for (int i = favs.Count - 1; i >= 0; i--) {
          if (!string.Equals(PathOf(favs[i]), full, StringComparison.OrdinalIgnoreCase)) continue;
          hit = true;
          if (remove) { favs.RemoveAt(i); res.RemoveAt(i); } else res[i] = System.IO.File.ReadAllBytes(full);
        }
        if (hit) Write(k, favs, res);
      }
      return hit;
    }

    // Reorders the pin list. order = pinned paths in the desired order; it must be a
    // permutation of List(). Explorer must be stopped (order is read at startup).
    public static void SetOrder(string[] order) {
      using (var k = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(Key)) {
        System.Collections.Generic.List<byte[]> favs, res; Strict(k, out favs, out res);
        if (order.Length != favs.Count) throw new ArgumentException("order must list every pinned item");
        var paths = new string[favs.Count]; for (int i = 0; i < favs.Count; i++) paths[i] = PathOf(favs[i]);
        var used = new bool[favs.Count];
        var nf = new System.Collections.Generic.List<byte[]>(); var nr = new System.Collections.Generic.List<byte[]>();
        foreach (var p in order) {
          int idx = -1;
          for (int i = 0; i < paths.Length; i++)
            if (!used[i] && string.Equals(paths[i], p, StringComparison.OrdinalIgnoreCase)) { idx = i; break; }
          if (idx < 0) throw new ArgumentException("Not pinned (or listed twice): " + p);
          used[idx] = true; nf.Add(favs[idx]); nr.Add(res[idx]);
        }
        Write(k, nf, nr);
      }
    }

    public static int Count() {
      using (var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(Key)) {
        return k == null ? 0 : Split(k.GetValue("Favorites") as byte[], false).Count;
      }
    }

    // Explorer tags each pinned file item with three extension blocks; without them the
    // pin is kept in the registry but never shown:
    //   BEEF001E  pin source ("UserPinned")   BEEF002B  pin time (FILETIME)   BEEF001D  AppUserModelID
    // Each block: cb(2) ver(2) sig(4) payload, then a WORD = offset of the item's first block.
    static byte[] Block(uint sig, byte[] payload, ushort firstBlockOffset) {
      var b = new byte[8 + payload.Length + 2];
      BitConverter.GetBytes((ushort)b.Length).CopyTo(b, 0);
      BitConverter.GetBytes(sig).CopyTo(b, 4);
      payload.CopyTo(b, 8);
      BitConverter.GetBytes(firstBlockOffset).CopyTo(b, b.Length - 2);
      return b;
    }
    static byte[] Str(string s) {
      var u = System.Text.Encoding.Unicode.GetBytes(s + "\0"); var b = new byte[2 + u.Length];
      b[0] = 2; u.CopyTo(b, 2); return b;
    }
    // item = one file item (cb-prefixed, no terminator). Returns the item with pin blocks added.
    static byte[] TagItem(byte[] item, string appId) {
      ushort first = BitConverter.ToUInt16(item, item.Length - 2); // BEEF0004 ends with its own offset
      if (first < 14 || first >= item.Length || BitConverter.ToUInt32(item, first + 4) != 0xBEEF0004)
        throw new InvalidOperationException("Unexpected file item layout");
      var ms = new System.IO.MemoryStream();
      ms.Write(item, 0, item.Length);
      var blocks = new[] {
        Block(0xBEEF001E, Str("UserPinned"), first),
        Block(0xBEEF002B, BitConverter.GetBytes(DateTime.UtcNow.ToFileTimeUtc()), first),
        Block(0xBEEF001D, Str(appId), first)
      };
      foreach (var b in blocks) ms.Write(b, 0, b.Length);
      var o = ms.ToArray();
      BitConverter.GetBytes((ushort)o.Length).CopyTo(o, 0);
      return o;
    }

    // Appends lnkPath (which must already live in PinnedFolder()) to the pin list.
    // appId: the app's AppUserModelID (explicit, or the computed one from Get-StartApps).
    public static void Append(string lnkPath, string appId) {
      string full = System.IO.Path.GetFullPath(lnkPath);
      using (var k = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(Key)) {
        System.Collections.Generic.List<byte[]> favs, res; Strict(k, out favs, out res);

        // PIDL: reuse the UserPinned\TaskBar prefix explorer itself wrote (first two items),
        // then append the new file's item. Fall back to a full desktop-rooted PIDL.
        byte[] pidl = null;
        foreach (var e in favs) {
          int i0 = BitConverter.ToUInt16(e, 0); if (i0 == 0 || i0 >= e.Length) continue;
          int i1 = BitConverter.ToUInt16(e, i0); if (i1 == 0 || i0 + i1 + 2 > e.Length) continue;
          if (e[2] != 0x1F) continue; // root must be a known-folder/root item
          // only reuse prefixes whose 2nd item is the "TaskBar" folder
          if (System.Text.Encoding.ASCII.GetString(e, i0, i1).IndexOf("TaskBar", StringComparison.Ordinal) < 0) continue;
          byte[] last = Parse(full, true);               // item + 2-byte terminator
          var item = new byte[last.Length - 2]; Buffer.BlockCopy(last, 0, item, 0, item.Length);
          item = TagItem(item, appId);
          pidl = new byte[i0 + i1 + item.Length + 2];
          Buffer.BlockCopy(e, 0, pidl, 0, i0 + i1);
          Buffer.BlockCopy(item, 0, pidl, i0 + i1, item.Length); // trailing 2 bytes stay 0
          break;
        }
        if (pidl == null) throw new InvalidOperationException(
          "No existing taskbar pin to copy the pinned-folder prefix from; pin any app once manually first.");

        favs.Add(pidl); res.Add(System.IO.File.ReadAllBytes(full));
        Write(k, favs, res);
      }
    }
  }

  // ---------- Taskbar color probe ----------
  // Samples the taskbar background so we can notice when an explorer restart changed
  // its look (e.g. TranslucentTB hitting its crash failsafe).
  public static class TaskbarColor {
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowW(string cls, string name);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
    [DllImport("gdi32.dll")] static extern uint GetPixel(IntPtr dc, int x, int y);

    // Median RGB (0xRRGGBB) along a row near the taskbar's top edge, or -1 if not found.
    public static int Sample() {
      SetProcessDPIAware();
      IntPtr tray = FindWindowW("Shell_TrayWnd", null); RECT r;
      if (tray == IntPtr.Zero || !GetWindowRect(tray, out r)) return -1;
      int w = r.R - r.L, h = r.B - r.T; if (w <= 0 || h <= 0) return -1;
      int y = r.T + Math.Max(1, h / 7);
      var px = new System.Collections.Generic.List<int>();
      IntPtr dc = GetDC(IntPtr.Zero);
      try {
        for (int i = 1; i < 20; i++) {
          uint c = GetPixel(dc, r.L + w * i / 20, y); if (c == 0xFFFFFFFF) continue;
          px.Add((int)(((c & 0xFF) << 16) | (c & 0xFF00) | ((c >> 16) & 0xFF)));
        }
      } finally { ReleaseDC(IntPtr.Zero, dc); }
      if (px.Count == 0) return -1;
      px.Sort((a, b) => Lum(a).CompareTo(Lum(b)));
      return px[px.Count / 2];
    }
    // True once explorer has created the taskbar window again.
    public static bool TrayPresent() { return FindWindowW("Shell_TrayWnd", null) != IntPtr.Zero; }
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    // Process id of the explorer.exe that owns the taskbar (0 if there is no taskbar), so a
    // restart can leave separate-process folder windows alone.
    public static int TrayProcessId() {
      IntPtr tray = FindWindowW("Shell_TrayWnd", null); uint pid = 0;
      if (tray != IntPtr.Zero) GetWindowThreadProcessId(tray, out pid);
      return (int)pid;
    }
    static int Lum(int c) { return ((c >> 16) & 0xFF) * 3 + ((c >> 8) & 0xFF) * 6 + (c & 0xFF); }
    public static int Distance(int a, int b) {
      if (a < 0 || b < 0) return 0;
      return Math.Abs(((a >> 16) & 0xFF) - ((b >> 16) & 0xFF)) + Math.Abs(((a >> 8) & 0xFF) - ((b >> 8) & 0xFF)) + Math.Abs((a & 0xFF) - (b & 0xFF));
    }
  }

  // ---------- Icon refresh ----------
  public static class Refresh {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern void SHChangeNotify(int e, uint f, string a, IntPtr b);
    [DllImport("shell32.dll")] static extern void SHChangeNotify(int e, uint f, IntPtr a, IntPtr b);
    public static void Item(string path) {
      SHChangeNotify(0x00002000 /*SHCNE_UPDATEITEM*/, 0x0005 /*SHCNF_PATHW*/ | 0x1000 /*FLUSH*/, path, IntPtr.Zero);
    }
    public static void Associations() {
      SHChangeNotify(0x08000000 /*SHCNE_ASSOCCHANGED*/, 0x1000, IntPtr.Zero, IntPtr.Zero);
    }
  }

  // ---------- Screenshots (so agents can check their changes) ----------
  public static class Capture {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowW(string cls, string name);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowExW(IntPtr parent, IntPtr after, string cls, string name);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);

    // Returns "width x height" of the saved PNG.
    public static string Screen(string path, int maxWidth) {
      SetProcessDPIAware();
      return Region(GetSystemMetrics(76), GetSystemMetrics(77), GetSystemMetrics(78), GetSystemMetrics(79), path, maxWidth);
    }
    public static string Taskbar(string path, int maxWidth) {
      SetProcessDPIAware();
      IntPtr tray = FindWindowW("Shell_TrayWnd", null); RECT r;
      if (tray == IntPtr.Zero || !GetWindowRect(tray, out r)) throw new InvalidOperationException("Taskbar window not found");
      return Region(r.L, r.T, r.R - r.L, r.B - r.T, path, maxWidth);
    }
    // The desktop icon layer, drawn even when windows cover it (the wallpaper is not included).
    public static string Desktop(string path, int maxWidth) {
      SetProcessDPIAware();
      IntPtr view = FindWindowExW(FindWindowW("Progman", null), IntPtr.Zero, "SHELLDLL_DefView", null);
      for (IntPtr w = IntPtr.Zero; view == IntPtr.Zero; ) {
        w = FindWindowExW(IntPtr.Zero, w, "WorkerW", null); if (w == IntPtr.Zero) break;
        view = FindWindowExW(w, IntPtr.Zero, "SHELLDLL_DefView", null);
      }
      IntPtr lv = view == IntPtr.Zero ? IntPtr.Zero : FindWindowExW(view, IntPtr.Zero, "SysListView32", null);
      RECT r; if (lv == IntPtr.Zero || !GetWindowRect(lv, out r)) throw new InvalidOperationException("Desktop icon view not found");
      using (var bmp = new System.Drawing.Bitmap(r.R - r.L, r.B - r.T)) {
        using (var g = System.Drawing.Graphics.FromImage(bmp)) {
          g.Clear(System.Drawing.Color.Black);
          IntPtr dc = g.GetHdc(); try { PrintWindow(lv, dc, 2 /*PW_RENDERFULLCONTENT*/); } finally { g.ReleaseHdc(dc); }
        }
        return Save(bmp, path, maxWidth);
      }
    }
    public static string Region(int x, int y, int w, int h, string path, int maxWidth) {
      SetProcessDPIAware();
      if (w <= 0 || h <= 0) throw new ArgumentException("empty capture region");
      using (var bmp = new System.Drawing.Bitmap(w, h)) {
        using (var g = System.Drawing.Graphics.FromImage(bmp)) g.CopyFromScreen(x, y, 0, 0, bmp.Size);
        return Save(bmp, path, maxWidth);
      }
    }
    static string Save(System.Drawing.Bitmap bmp, string path, int maxWidth) {
      int w = bmp.Width, h = bmp.Height;
      if (maxWidth > 0 && w > maxWidth) { h = Math.Max(1, h * maxWidth / w); w = maxWidth; }
      using (var o = new System.Drawing.Bitmap(w, h)) {
        using (var g = System.Drawing.Graphics.FromImage(o)) {
          g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
          g.DrawImage(bmp, 0, 0, w, h);
        }
        o.Save(path, System.Drawing.Imaging.ImageFormat.Png);
      }
      return w + "x" + h;
    }
  }
}
