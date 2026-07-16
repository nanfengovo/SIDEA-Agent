using System.Collections.ObjectModel;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using SIDEA.Client.Views;

namespace SIDEA.Client.ViewModels;

public partial class AdminViewModel : ViewModelBase
{
    private readonly HttpClient _httpClient = new();

    public ObservableCollection<ConfigItem> Configs { get; } = new();
    public ObservableCollection<SkillConfigItem> Skills { get; } = new();
    public ObservableCollection<ToolItem> Tools { get; } = new();

    public AdminViewModel()
    {
        _ = LoadDataAsync();
    }

    private async Task LoadDataAsync()
    {
        try
        {
            var configStr = await _httpClient.GetStringAsync("http://localhost:8000/api/config");
            var configData = JsonSerializer.Deserialize<ConfigItem[]>(configStr, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (configData != null) foreach (var c in configData) Configs.Add(c);

            var skillsStr = await _httpClient.GetStringAsync("http://localhost:8000/api/admin/skills");
            var skillsData = JsonSerializer.Deserialize<SkillConfigItem[]>(skillsStr, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (skillsData != null) foreach (var s in skillsData) Skills.Add(s);

            var toolsStr = await _httpClient.GetStringAsync("http://localhost:8000/api/admin/tools");
            var toolsData = JsonSerializer.Deserialize<ToolItem[]>(toolsStr, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (toolsData != null) foreach (var t in toolsData) Tools.Add(t);
        }
        catch { }
    }

    [RelayCommand]
    private async Task EditConfigAsync(ConfigItem config)
    {
        var app = Avalonia.Application.Current?.ApplicationLifetime as IClassicDesktopStyleApplicationLifetime;
        if (app?.MainWindow is Window mainWindow)
        {
            var dialog = new ConfigEditWindow(config);
            var result = await dialog.ShowDialog<ConfigItem?>(mainWindow);
            if (result != null)
            {
                await SaveConfigAsync(result);
            }
        }
    }

    [RelayCommand]
    private async Task DeleteConfigAsync(ConfigItem config)
    {
        try
        {
            var res = await _httpClient.DeleteAsync($"http://localhost:8000/api/config/{config.ConfigKey}");
            if (res.IsSuccessStatusCode)
            {
                Configs.Remove(config);
            }
        }
        catch { }
    }

    public async Task SaveConfigAsync(ConfigItem config)
    {
        try
        {
            var content = new StringContent(JsonSerializer.Serialize(config), Encoding.UTF8, "application/json");
            var res = await _httpClient.PostAsync("http://localhost:8000/api/config", content);
            if (res.IsSuccessStatusCode)
            {
                Configs.Clear();
                await LoadDataAsync();
            }
        }
        catch { }
    }

    [RelayCommand]
    private async Task EditSkillAsync(SkillConfigItem skill)
    {
        var app = Avalonia.Application.Current?.ApplicationLifetime as IClassicDesktopStyleApplicationLifetime;
        if (app?.MainWindow is Window mainWindow)
        {
            var dialog = new SkillEditWindow(skill);
            var result = await dialog.ShowDialog<SkillConfigItem?>(mainWindow);
            if (result != null)
            {
                await SaveSkillAsync(result);
            }
        }
    }

    [RelayCommand]
    private async Task DeleteSkillAsync(SkillConfigItem skill)
    {
        try
        {
            var res = await _httpClient.DeleteAsync($"http://localhost:8000/api/admin/skills/{skill.SkillId}");
            if (res.IsSuccessStatusCode)
            {
                Skills.Remove(skill);
            }
        }
        catch { }
    }

    public async Task SaveSkillAsync(SkillConfigItem skill)
    {
        try
        {
            var content = new StringContent(JsonSerializer.Serialize(skill), Encoding.UTF8, "application/json");
            var res = await _httpClient.PostAsync("http://localhost:8000/api/admin/skills", content);
            if (res.IsSuccessStatusCode)
            {
                Skills.Clear();
                await LoadDataAsync();
            }
        }
        catch { }
    }
}

public class ConfigItem
{
    public string ConfigKey { get; set; } = string.Empty;
    public string ConfigValue { get; set; } = string.Empty;
    public string Category { get; set; } = "general";
    public string Description { get; set; } = string.Empty;
}

public class SkillConfigItem
{
    public string SkillId { get; set; } = string.Empty;
    public string SkillName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string TemplatePath { get; set; } = string.Empty;
}

public class ToolItem
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}
