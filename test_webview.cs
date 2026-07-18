using System;
using System.Reflection;
class Program {
    static void Main() {
        var asm = Assembly.LoadFrom("/Users/feng/.nuget/packages/avalonia.controls.webview/12.0.1/lib/net10.0/Avalonia.Controls.WebView.dll");
        foreach(var type in asm.GetTypes()) {
            if(type.Name.Contains("WebView")) Console.WriteLine(type.FullName);
        }
    }
}
