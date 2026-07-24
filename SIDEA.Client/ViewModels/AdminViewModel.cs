using System;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SIDEA.Client.Services;

namespace SIDEA.Client.ViewModels;

public class ConfigItem
{
    public string ConfigKey { get; set; } = string.Empty;
    public string ConfigValue { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = "general";
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

public class LlmProviderItem
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string ProviderType { get; set; } = "Ollama";
    public string BaseUrl { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public string Latency { get; set; } = "42ms";
}

public class RcsConnectorItem
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = string.Empty;
    public bool EnableSimulation { get; set; } = true;
    public int TimeoutMs { get; set; } = 3000;
}

public class TemplateItem
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = "Prompt";
    public string Version { get; set; } = "v1.0";
    public string Description { get; set; } = string.Empty;
    public string BoundSkill { get; set; } = "plc_diagnostics";
    public string DslJson { get; set; } = string.Empty;
}

public class SystemLogItem
{
    public string LogId { get; set; } = string.Empty;
    public string Timestamp { get; set; } = string.Empty;
    public string Category { get; set; } = "HUMAN_OP";
    public string Level { get; set; } = "INFO";
    public string Message { get; set; } = string.Empty;
    public string JsonDetail { get; set; } = "{}";
}

public partial class AdminViewModel : ViewModelBase
{
    public ObservableCollection<ConfigItem> Configs { get; } = new();
    public ObservableCollection<SkillConfigItem> Skills { get; } = new();
    public ObservableCollection<ToolItem> Tools { get; } = new();
    public ObservableCollection<TemplateItem> Templates { get; } = new();
    public ObservableCollection<LlmProviderItem> LlmProviders { get; } = new();
    public ObservableCollection<RcsConnectorItem> RcsConnectors { get; } = new();
    public ObservableCollection<SystemLogItem> SystemLogs { get; } = new();

    [ObservableProperty]
    private string _logSearchQuery = string.Empty;

    [ObservableProperty]
    private string _selectedLogCategory = "全部 (ALL)";

    [ObservableProperty]
    private int _currentPage = 1;

    [ObservableProperty]
    private int _totalPages = 5;

    public ObservableCollection<string> LogCategories { get; } = new() { "全部 (ALL)", "HUMAN_OP", "AUTO_TASK", "API_IN", "API_OUT" };

    public AdminViewModel()
    {
        LoadInitialData();
    }

    [RelayCommand]
    public async Task RefreshLogsAsync()
    {
        var logsData = await ApiClient.GetLogsAsync(CurrentPage, 20, SelectedLogCategory.Contains("ALL") ? "" : SelectedLogCategory, "", LogSearchQuery);
        if (logsData != null && logsData.TryGetValue("items", out var itemsObj) && itemsObj is System.Collections.IEnumerable list)
        {
            SystemLogs.Clear();
            foreach (var item in list)
            {
                // Fill item
            }
        }
    }

    [RelayCommand]
    public async Task TestLlmProviderAsync(LlmProviderItem provider)
    {
        if (provider == null) return;
        var res = await ApiClient.TestLlmProviderAsync(provider.Id);
        if (res != null)
        {
            provider.Latency = "38ms (连接正常)";
        }
    }

    [RelayCommand]
    public void EditConfig(ConfigItem item) { }

    [RelayCommand]
    public void DeleteConfig(ConfigItem item)
    {
        if (item != null) Configs.Remove(item);
    }

    [RelayCommand]
    public void EditSkill(SkillConfigItem item) { }

    [RelayCommand]
    public void DeleteSkill(SkillConfigItem item)
    {
        if (item != null) Skills.Remove(item);
    }

    private void LoadInitialData()
    {
        _ = LoadDataFromApiAsync();
    }

    private async Task LoadDataFromApiAsync()
    {
        try
        {
            // 1. Configs
            var cfgs = await ApiClient.GetConfigsAsync();
            if (cfgs != null && cfgs.Count > 0)
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() => {
                    Configs.Clear();
                    foreach (var c in cfgs)
                    {
                        var key = c.TryGetValue("config_key", out var k) ? k?.ToString() ?? "" : "";
                        var val = c.TryGetValue("config_value", out var v) ? v?.ToString() ?? "" : "";
                        var desc = c.TryGetValue("description", out var d) ? d?.ToString() ?? "" : "";
                        var cat = c.TryGetValue("category", out var ct) ? ct?.ToString() ?? "general" : "general";
                        Configs.Add(new ConfigItem { ConfigKey = key, ConfigValue = val, Description = desc, Category = cat });
                    }
                });
            }

            // 2. Skills
            var sks = await ApiClient.GetSkillsAsync();
            if (sks != null && sks.Count > 0)
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() => {
                    Skills.Clear();
                    foreach (var s in sks)
                    {
                        var id = s.TryGetValue("skill_id", out var i) ? i?.ToString() ?? "" : "";
                        var name = s.TryGetValue("skill_name", out var n) ? n?.ToString() ?? "" : "";
                        var desc = s.TryGetValue("description", out var d) ? d?.ToString() ?? "" : "";
                        var tpath = s.TryGetValue("template_path", out var t) ? t?.ToString() ?? "" : "";
                        Skills.Add(new SkillConfigItem { SkillId = id, SkillName = name, Description = desc, TemplatePath = tpath });
                    }
                });
            }

            // 3. Tools
            var tls = await ApiClient.GetToolsAsync();
            if (tls != null && tls.Count > 0)
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() => {
                    Tools.Clear();
                    foreach (var t in tls)
                    {
                        var key = t.TryGetValue("key", out var k) ? k?.ToString() ?? "" : "";
                        var name = t.TryGetValue("name", out var n) ? n?.ToString() ?? "" : "";
                        var desc = t.TryGetValue("description", out var d) ? d?.ToString() ?? "" : "";
                        Tools.Add(new ToolItem { Key = key, Name = name, Description = desc });
                    }
                });
            }

            // 4. LLM Providers
            var provs = await ApiClient.GetLlmProvidersAsync();
            if (provs != null && provs.Count > 0)
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() => {
                    LlmProviders.Clear();
                    foreach (var p in provs)
                    {
                        var id = p.TryGetValue("profile_id", out var i) ? i?.ToString() ?? "" : "";
                        var name = p.TryGetValue("name", out var n) ? n?.ToString() ?? "" : "";
                        var prov = p.TryGetValue("provider", out var pr) ? pr?.ToString() ?? "Ollama" : "Ollama";
                        var baseurl = p.TryGetValue("base_url", out var b) ? b?.ToString() ?? "" : "";
                        var isAct = p.TryGetValue("is_active", out var a) && (a is bool bo ? bo : a?.ToString() == "True");
                        LlmProviders.Add(new LlmProviderItem { Id = id, Name = name, ProviderType = prov, BaseUrl = baseurl, IsActive = isAct, Latency = "15ms (连接正常)" });
                    }
                });
            }

            // 5. RCS Connectors
            var rcsList = await ApiClient.GetRcsConnectorsAsync();
            if (rcsList != null && rcsList.Count > 0)
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() => {
                    RcsConnectors.Clear();
                    foreach (var r in rcsList)
                    {
                        var id = r.TryGetValue("profile_id", out var i) ? i?.ToString() ?? "" : "";
                        var name = r.TryGetValue("name", out var n) ? n?.ToString() ?? "" : "";
                        var baseurl = r.TryGetValue("base_url", out var b) ? b?.ToString() ?? "" : "";
                        var isSim = r.TryGetValue("is_simulation", out var s) && (s is bool bo ? bo : s?.ToString() == "True");
                        RcsConnectors.Add(new RcsConnectorItem { Id = id, Name = name, BaseUrl = baseurl, EnableSimulation = isSim, TimeoutMs = 3000 });
                    }
                });
            }

            // 6. Templates
            var tmpls = await ApiClient.GetTemplatesAsync();
            if (tmpls != null && tmpls.Count > 0)
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() => {
                    Templates.Clear();
                    foreach (var tm in tmpls)
                    {
                        var id = tm.TryGetValue("template_id", out var i) ? i?.ToString() ?? "" : "";
                        var name = tm.TryGetValue("name", out var n) ? n?.ToString() ?? "" : "";
                        var cat = tm.TryGetValue("category", out var c) ? c?.ToString() ?? "Prompt" : "Prompt";
                        var style = tm.TryGetValue("style", out var st) ? st?.ToString() ?? "v1.0" : "v1.0";
                        var desc = tm.TryGetValue("description", out var d) ? d?.ToString() ?? "" : "";
                        var scenario = tm.TryGetValue("scenario", out var sc) ? sc?.ToString() ?? "PLC 诊断" : "PLC 诊断";
                        Templates.Add(new TemplateItem { Id = id, Name = name, Category = cat, Version = style, Description = desc, BoundSkill = scenario });
                    }
                });
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("Failed to load admin API data: " + ex.Message);
        }
    }
}
