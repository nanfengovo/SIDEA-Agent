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

    public void SelectTab(int index)
    {
        if (ModuleListBox != null)
        {
            ModuleListBox.SelectedIndex = index;
        }
    }

    private async void OnAddConfigClick(object? sender, RoutedEventArgs e)
    {
        var vm = DataContext as AdminViewModel;
        if (vm == null) return;

        var dialog = new ConfigEditWindow(new ConfigItem(), true);
        var result = await dialog.ShowDialog<ConfigItem?>(this);

        if (result != null)
        {
            vm.Configs.Add(result);
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
            vm.Skills.Add(result);
        }
    }

    private void OnTabSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (sender is ListBox listBox && ConfigTab != null)
        {
            int idx = listBox.SelectedIndex;
            ConfigTab.IsVisible = idx == 0;
            if (LlmTab != null) LlmTab.IsVisible = idx == 1;
            if (RcsTab != null) RcsTab.IsVisible = idx == 2;
            if (SkillsTab != null) SkillsTab.IsVisible = idx == 3;
            if (TemplatesTab != null) TemplatesTab.IsVisible = idx == 4;
            if (ToolsTab != null) ToolsTab.IsVisible = idx == 5;
            if (LogsTab != null) LogsTab.IsVisible = idx == 6;
        }
    }

    private async void OnPreviewTemplateClick(object? sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.DataContext is TemplateItem item)
        {
            var win = new TemplatePreviewWindow(item);
            await win.ShowDialog(this);
        }
    }
}
