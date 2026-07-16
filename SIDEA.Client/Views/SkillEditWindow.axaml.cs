using Avalonia.Controls;
using Avalonia.Interactivity;
using SIDEA.Client.ViewModels;

namespace SIDEA.Client.Views;

public partial class SkillEditWindow : Window
{
    public SkillConfigItem? Result { get; private set; }

    public SkillEditWindow()
    {
        InitializeComponent();
    }

    public SkillEditWindow(SkillConfigItem skill, bool isNew = false) : this()
    {
        IdBox.Text = skill.SkillId;
        NameBox.Text = skill.SkillName;
        DescBox.Text = skill.Description;
        PathBox.Text = skill.TemplatePath;
        IdBox.IsEnabled = isNew;
    }

    private void OnSaveClick(object? sender, RoutedEventArgs e)
    {
        Result = new SkillConfigItem
        {
            SkillId = IdBox.Text ?? "",
            SkillName = NameBox.Text ?? "",
            Description = DescBox.Text ?? "",
            TemplatePath = PathBox.Text ?? ""
        };
        Close(Result);
    }

    private void OnCancelClick(object? sender, RoutedEventArgs e)
    {
        Close(null);
    }
}
