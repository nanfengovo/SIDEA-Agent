using System;
using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Avalonia.Markup.Xaml.Styling;
using SIDEA.Client.ViewModels;
using SIDEA.Client.Views;

namespace SIDEA.Client;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.MainWindow = new MainWindow
            {
                DataContext = new MainWindowViewModel(),
            };
        }

        base.OnFrameworkInitializationCompleted();
    }

    public static void ChangeLanguage(string lang)
    {
        if (Current == null) return;
        var uri = new Uri($"avares://SIDEA.Client/Assets/{lang}.axaml");
        var resourceDictionary = new ResourceInclude(uri) { Source = uri };
        Current.Resources.MergedDictionaries.Clear();
        Current.Resources.MergedDictionaries.Add(resourceDictionary);
    }
}