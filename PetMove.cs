using System;
using System.Runtime.InteropServices;
class PetMove {
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    public struct RECT { public int Left, Top, Right, Bottom; }
    static void Main(string[] args) {
        int x = args.Length > 0 ? int.Parse(args[0]) : 1100;
        int y = args.Length > 1 ? int.Parse(args[1]) : 300;
        IntPtr h = FindWindow(null, "dsh-pet 桌宠（桌面模式）");
        if (h == IntPtr.Zero) { Console.WriteLine("notfound"); return; }
        SetWindowPos(h, IntPtr.Zero, x, y, 0, 0, 0x0001 | 0x0004);
        RECT r; GetWindowRect(h, out r);
        Console.WriteLine("moved " + r.Left + "," + r.Top);
    }
}
