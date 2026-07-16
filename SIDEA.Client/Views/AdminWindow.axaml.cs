using Avalonia.Controls;
using Avalonia.Interactivity;
using SIDEA.Client.ViewModels;

namespace SIDEA.Client.Views;

public partial class AdminWindow : Window
{
    public AdminWindow()
    {
        InitializeComponent();
    }

    private void OnToolsTabClick(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        ConfigTab.IsVisible = false;
        SkillsTab.IsVisible = false;
        ToolsTab.IsVisible = true;
    }

    private async void OnAddConfigClick(object? sender, RoutedEventArgs e)
    {
        var vm = DataContext as AdminViewModel;
        if (vm == null) return;

        var dialog = new ConfigEditWindow(new ConfigItem(), true);
        var result = await dialog.ShowDialog<ConfigItem?>(this);

        if (result != null)
        {
            await vm.SaveConfigAsync(result);
        }
    }

    private async void OnAddSkillClick(object? sender, RoutedEventArgs e)
    {
        var vm = DataContext as AdminViewModel;
        if (vm == null) return;

        var dialog = new SkillEditWindow(new SkillConfigItem(), true);
        var result = await dialog.ShowDialog<SkillConfigItem?>(this);

        if (result != null)
        {
            await vm.SaveSkillAsync(result);
        }
    }

    private void OnTabSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (sender is ListBox listBox && ConfigTab != null && SkillsTab != null && ToolsTab != null)
        {
            ConfigTab.IsVisible = listBox.SelectedIndex == 0;
            SkillsTab.IsVisible = listBox.SelectedIndex == 1;
            ToolsTab.IsVisible = listBox.SelectedIndex == 2;
        }
    }
}
