using Avalonia.Controls;
using Avalonia.Input;
using SIDEA.Client.ViewModels;

namespace SIDEA.Client.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private void OnInputKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter && DataContext is MainWindowViewModel vm)
        {
            if (vm.SendMessageCommand.CanExecute(null))
            {
                vm.SendMessageCommand.Execute(null);
            }
        }
    }

    private void OnAdminButtonClicked(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        var adminWindow = new AdminWindow();
        adminWindow.ShowDialog(this);
    }
}