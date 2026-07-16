using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace SIDEA.Client.ViewModels;

public partial class MainWindowViewModel : ViewModelBase
{
    private readonly HttpClient _httpClient = new HttpClient();

    [ObservableProperty]
    private string _inputText = string.Empty;

    [ObservableProperty]
    private bool _isBusy;

    [ObservableProperty]
    private SkillItem? _selectedSkill;

    [ObservableProperty]
    private ModelItem? _selectedModel;

    [ObservableProperty]
    private string _thinkingDepthDisplay = "深度: 自动";

    [ObservableProperty]
    private string _contextLengthDisplay = "上下文: 8K";

    public ObservableCollection<string> ThinkingDepths { get; } = new() { "深度: 自动", "深度: 深度推理", "深度: 快速响应" };
    public ObservableCollection<string> ContextLengths { get; } = new() { "上下文: 8K", "上下文: 32K", "上下文: 128K" };

    private string GetThinkingDepthValue() => ThinkingDepthDisplay switch {
        "深度: 深度推理" => "deep",
        "深度: 快速响应" => "fast",
        _ => "auto"
    };

    private string GetContextLengthValue() => ContextLengthDisplay switch {
        "上下文: 32K" => "32k",
        "上下文: 128K" => "128k",
        _ => "8k"
    };

    public ObservableCollection<ChatMessage> ChatMessages { get; } = new();
    public ObservableCollection<TraceEvent> TraceEvents { get; } = new();
    public ObservableCollection<SkillItem> Skills { get; } = new();
    public ObservableCollection<ModelItem> Models { get; } = new();

    public MainWindowViewModel()
    {
        ChatMessages.Add(new ChatMessage { Role = "System", Content = "SIDEA Agent 已上线。系统处于待命状态。" });
        
        // Initialize hardcoded models
        Models.Add(new ModelItem { Id = "gemma4:e2b-it-qat", Name = "Gemma-4 QAT" });
        Models.Add(new ModelItem { Id = "llama3:8b-instruct", Name = "Llama3 8B" });
        Models.Add(new ModelItem { Id = "qwen2:7b", Name = "Qwen2 7B" });
        SelectedModel = Models[0];

        _ = LoadInitialDataAsync();
    }

    private async Task LoadInitialDataAsync()
    {
        try
        {
            var skillsJson = await _httpClient.GetStringAsync("http://localhost:8000/api/skills");
            using var doc = JsonDocument.Parse(skillsJson);
            foreach (var el in doc.RootElement.EnumerateArray())
            {
                var id = el.GetProperty("skill_id").GetString() ?? "";
                var name = el.GetProperty("skill_name").GetString() ?? "";
                var skill = new SkillItem { Id = id, Name = name };
                Dispatcher.UIThread.Post(() => Skills.Add(skill));
                if (id == "plc_diagnostics" && SelectedSkill == null)
                {
                    Dispatcher.UIThread.Post(() => SelectedSkill = skill);
                }
            }
            if (SelectedSkill == null && Skills.Count > 0)
            {
                Dispatcher.UIThread.Post(() => SelectedSkill = Skills[0]);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("Failed to load data: " + ex.Message);
        }
    }

    [RelayCommand]
    private async Task SendMessageAsync()
    {
        if (string.IsNullOrWhiteSpace(InputText) || IsBusy) return;

        var userMsg = InputText;
        InputText = string.Empty;
        IsBusy = true;
        
        string skillId = SelectedSkill?.Id ?? "general_assistant";

        ChatMessages.Add(new ChatMessage { Role = "User", Content = userMsg });

        try
        {
            var requestBody = new { 
                message = userMsg, 
                skill_id = skillId,
                thinking_depth = GetThinkingDepthValue(),
                context_length = GetContextLengthValue()
            };
            var jsonContent = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

            var request = new HttpRequestMessage(HttpMethod.Post, "http://localhost:8000/api/chat/stream")
            {
                Content = jsonContent
            };

            using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
            response.EnsureSuccessStatusCode();

            var currentAgentMsg = new ChatMessage { Role = "Agent", Content = "" };
            ChatMessages.Add(currentAgentMsg);

            using var stream = await response.Content.ReadAsStreamAsync();
            using var reader = new StreamReader(stream);

            string? line;
            while ((line = await reader.ReadLineAsync()) != null)
            {
                if (string.IsNullOrWhiteSpace(line) || !line.StartsWith("data: ")) continue;

                var dataStr = line.Substring(6).Trim();
                if (dataStr == "null") continue;

                try
                {
                    using var eventDoc = JsonDocument.Parse(dataStr);
                    var type = eventDoc.RootElement.GetProperty("type").GetString();
                    var dataObj = eventDoc.RootElement.GetProperty("data");

                    if (type == "llm_token")
                    {
                        if (dataObj.TryGetProperty("token", out var tokenProp))
                        {
                            var token = tokenProp.GetString();
                            Dispatcher.UIThread.Post(() => currentAgentMsg.Content += token);
                        }
                    }
                    else if (type == "llm_final")
                    {
                        if (dataObj.TryGetProperty("content", out var contentProp))
                        {
                            var finalContent = contentProp.GetString();
                            Dispatcher.UIThread.Post(() => {
                                if (string.IsNullOrEmpty(currentAgentMsg.Content))
                                {
                                    currentAgentMsg.Content = finalContent ?? "";
                                }
                            });
                        }
                    }
                    else if (type == "error")
                    {
                        if (dataObj.TryGetProperty("message", out var msgProp))
                        {
                            var msg = msgProp.GetString();
                            Dispatcher.UIThread.Post(() => currentAgentMsg.Content += $"\n\n**系统异常:** {msg}");
                        }
                    }
                    else
                    {
                        var timestamp = DateTime.Now.ToString("HH:mm:ss");
                        var ev = new TraceEvent { Type = type ?? "unknown", Timestamp = timestamp };
                        
                        if (type == "tool_start" && dataObj.TryGetProperty("tool", out var toolProp))
                        {
                            ev.Description = $"[Tool: {toolProp.GetString()}] Started";
                        }
                        else if (type == "tool_end")
                        {
                            ev.Description = $"[Tool] Finished";
                        }
                        else if (type == "tool_error" && dataObj.TryGetProperty("error", out var errProp))
                        {
                            ev.Description = $"[Error] {errProp.GetString()}";
                        }
                        else if (dataObj.TryGetProperty("message", out var msgProp))
                        {
                            ev.Description = msgProp.GetString() ?? "";
                        }
                        
                        if (!string.IsNullOrEmpty(ev.Description))
                        {
                            Dispatcher.UIThread.Post(() => TraceEvents.Add(ev));
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Parse error: {ex.Message}");
                }
            }
        }
        catch (Exception ex)
        {
            ChatMessages.Add(new ChatMessage { Role = "System", Content = $"Error: {ex.Message}" });
        }
        finally
        {
            IsBusy = false;
        }
    }
}

public partial class ChatMessage : ObservableObject
{
    [ObservableProperty]
    private string _role = string.Empty;

    [ObservableProperty]
    private string _content = string.Empty;
}

public partial class TraceEvent : ObservableObject
{
    [ObservableProperty]
    private string _type = string.Empty;

    [ObservableProperty]
    private string _timestamp = string.Empty;

    [ObservableProperty]
    private string _description = string.Empty;
}

public partial class SkillItem : ObservableObject
{
    [ObservableProperty]
    private string _id = string.Empty;

    [ObservableProperty]
    private string _name = string.Empty;
}

public partial class ModelItem : ObservableObject
{
    [ObservableProperty]
    private string _id = string.Empty;

    [ObservableProperty]
    private string _name = string.Empty;
}
