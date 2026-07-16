using Avalonia.Controls;
using Avalonia.Interactivity;
using SIDEA.Client.ViewModels;

namespace SIDEA.Client.Views;

public partial class ConfigEditWindow : Window
{
    public ConfigItem? Result { get; private set; }

    public ConfigEditWindow()
    {
        InitializeComponent();
    }

    public ConfigEditWindow(ConfigItem config, bool isNew = false) : this()
    {
        KeyBox.Text = config.ConfigKey;
        ValueBox.Text = config.ConfigValue;
        DescBox.Text = config.Description;
        KeyBox.IsEnabled = isNew;
    }

    private void OnSaveClick(object? sender, RoutedEventArgs e)
    {
        Result = new ConfigItem
        {
            ConfigKey = KeyBox.Text ?? "",
            ConfigValue = ValueBox.Text ?? "",
            Description = DescBox.Text ?? "",
            Category = "general"
        };
        Close(Result);
    }

    private void OnCancelClick(object? sender, RoutedEventArgs e)
    {
        Close(null);
    }
}
