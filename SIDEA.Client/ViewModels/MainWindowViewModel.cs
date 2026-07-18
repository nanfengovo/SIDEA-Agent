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
using SIDEA.Client.Views;

namespace SIDEA.Client.ViewModels;

public partial class MainWindowViewModel : ViewModelBase
{
    private readonly HttpClient _httpClient = new HttpClient();

    [ObservableProperty]
    private string _inputText = string.Empty;

    [ObservableProperty]
    private bool _isBusy;

    [ObservableProperty]
    private bool _useKnowledge = true;

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

    [ObservableProperty]
    private string _permissionModeDisplay = "权限: 请求批准";
    public ObservableCollection<string> PermissionModes { get; } = new() { "权限: 请求批准", "权限: 替我审批", "权限: 完全访问" };

    private string GetPermissionModeValue() => PermissionModeDisplay switch {
        "权限: 替我审批" => "ask_risky",
        "权限: 完全访问" => "full_access",
        _ => "ask_always"
    };

    [ObservableProperty]
    private bool _isApprovalDialogVisible;
    [ObservableProperty]
    private string _pendingApprovalId = "";
    [ObservableProperty]
    private string _pendingApprovalMessage = "";

    [RelayCommand]
    private async Task ApproveToolAsync()
    {
        await SendApprovalAsync(true);
    }

    [RelayCommand]
    private async Task RejectToolAsync()
    {
        await SendApprovalAsync(false);
    }

    private async Task SendApprovalAsync(bool approved)
    {
        IsApprovalDialogVisible = false;
        try
        {
            var json = JsonSerializer.Serialize(new { approval_id = PendingApprovalId, approved = approved });
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            await _httpClient.PostAsync("http://localhost:8000/api/chat/approve", content);
        }
        catch (Exception ex)
        {
            // Log error
            RawLogs += $"\n[Error] Failed to send approval: {ex.Message}";
        }
    }

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

    public event EventHandler? MessageUpdated;

    [ObservableProperty]
    private string _currentSessionId = Guid.NewGuid().ToString();

    [ObservableProperty]
    private bool _isSidebarOpen = true;

    [ObservableProperty]
    private string _currentLanguage = "zh-CN";

    [ObservableProperty]
    private string? _replyingToMessage;

    [RelayCommand]
    private void ClearReply()
    {
        ReplyingToMessage = null;
    }

    [ObservableProperty]
    private string _rawLogs = string.Empty;

    public ObservableCollection<ChatMessage> ChatMessages { get; } = new();
    public ObservableCollection<TraceEvent> TraceEvents { get; } = new();
    public ObservableCollection<SkillItem> Skills { get; } = new();
    public ObservableCollection<ModelItem> Models { get; } = new();
    public ObservableCollection<ChatSession> ChatSessions { get; } = new();

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

            await FetchSessionsAsync();
        }
        catch (Exception ex)
        {
            Console.WriteLine("Failed to load data: " + ex.Message);
        }
    }

    private async Task FetchSessionsAsync()
    {
        try
        {
            var json = await _httpClient.GetStringAsync("http://localhost:8000/api/history/sessions");
            using var doc = JsonDocument.Parse(json);
            Dispatcher.UIThread.Post(() => ChatSessions.Clear());
            foreach (var el in doc.RootElement.EnumerateArray())
            {
                var s = new ChatSession {
                    SessionId = el.GetProperty("session_id").GetString() ?? "",
                    Title = el.GetProperty("title").GetString() ?? "New Chat",
                    CreatedAt = el.GetProperty("created_at").GetString() ?? ""
                };
                Dispatcher.UIThread.Post(() => ChatSessions.Add(s));
            }
        }
        catch { }
    }

    [RelayCommand]
    private async Task NewSessionAsync()
    {
        CurrentSessionId = Guid.NewGuid().ToString();
        ChatMessages.Clear();
        ChatMessages.Add(new ChatMessage { Role = "System", Content = "SIDEA Agent 已上线。新会话已开启。" });
        await FetchSessionsAsync();
    }

    [RelayCommand]
    private async Task SelectSessionAsync(string sessionId)
    {
        if (CurrentSessionId == sessionId) return;
        CurrentSessionId = sessionId;
        
        // Fetch session messages
        try 
        {
            var json = await _httpClient.GetStringAsync($"http://localhost:8000/api/history/sessions/{sessionId}");
            using var doc = JsonDocument.Parse(json);
            
            Dispatcher.UIThread.Post(() => ChatMessages.Clear());
            
            if (doc.RootElement.TryGetProperty("messages", out var msgsProp))
            {
                foreach (var m in msgsProp.EnumerateArray())
                {
                    var role = m.GetProperty("role").GetString() ?? "User";
                    var content = m.GetProperty("content").GetString() ?? "";
                    Dispatcher.UIThread.Post(() => ChatMessages.Add(new ChatMessage { Role = role, Content = content }));
                }
            }
            Dispatcher.UIThread.Post(() => MessageUpdated?.Invoke(this, EventArgs.Empty));
        }
        catch { }
    }

    [RelayCommand]
    private async Task DeleteSessionAsync(string sessionId)
    {
        try 
        {
            var res = await _httpClient.DeleteAsync($"http://localhost:8000/api/history/sessions/{sessionId}");
            if (res.IsSuccessStatusCode)
            {
                if (CurrentSessionId == sessionId) {
                    await NewSessionAsync();
                } else {
                    await FetchSessionsAsync();
                }
            }
        }
        catch { }
    }

    [RelayCommand]
    private async Task SelectFileCommand()
    {
        // TODO: File dialog
        await Task.CompletedTask;
    }

    [RelayCommand]
    private void ToggleSidebar()
    {
        IsSidebarOpen = !IsSidebarOpen;
    }

    public event EventHandler<bool>? ThemeChanged;

    [RelayCommand]
    private void ChangeTheme()
    {
        var app = Avalonia.Application.Current;
        if (app != null)
        {
            app.RequestedThemeVariant = app.RequestedThemeVariant == Avalonia.Styling.ThemeVariant.Dark
                ? Avalonia.Styling.ThemeVariant.Light
                : Avalonia.Styling.ThemeVariant.Dark;
            
            ThemeChanged?.Invoke(this, app.RequestedThemeVariant == Avalonia.Styling.ThemeVariant.Light);
        }
    }

    [RelayCommand]
    private void ChangeLanguage()
    {
        CurrentLanguage = CurrentLanguage == "zh-CN" ? "en-US" : "zh-CN";
        App.ChangeLanguage(CurrentLanguage);
    }

    [RelayCommand]
    private void OpenKnowledgeBase()
    {
        var kbWindow = new KnowledgeWindow();
        kbWindow.Show();
    }

    public ObservableCollection<string> PendingAttachments { get; } = new();

    public async Task UploadImageFromClipboardAsync(object clipboardData)
    {
        try
        {
            byte[]? imageBytes = null;
            if (clipboardData is byte[] bytes)
            {
                imageBytes = bytes;
            }
            // Avalonia clipboard images are often stream or byte array depending on platform. 
            // We can save to a temp file and upload.
            if (imageBytes != null && imageBytes.Length > 0)
            {
                var tempFile = Path.GetTempFileName() + ".png";
                await File.WriteAllBytesAsync(tempFile, imageBytes);
                
                using var form = new MultipartFormDataContent();
                using var fs = File.OpenRead(tempFile);
                using var streamContent = new StreamContent(fs);
                streamContent.Headers.Add("Content-Type", "application/octet-stream");
                form.Add(streamContent, "file", Path.GetFileName(tempFile));
                
                var response = await _httpClient.PostAsync("http://localhost:8000/api/upload", form);
                if (response.IsSuccessStatusCode)
                {
                    var resultJson = await response.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(resultJson);
                    if (doc.RootElement.TryGetProperty("url", out var urlProp))
                    {
                        var url = urlProp.GetString();
                        if (!string.IsNullOrEmpty(url))
                        {
                            Dispatcher.UIThread.Post(() => {
                                PendingAttachments.Add(url);
                                InputText += $"[图片已附加]";
                            });
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("Upload failed: " + ex.Message);
        }
    }

    [RelayCommand]
    private async Task UploadAttachmentCommand()
    {
        // Integration with File picker
        // Because ViewModels don't have direct access to views, this usually requires an Ioc service,
        // but for simplicity we will just append a placeholder text.
        InputText += "[请使用 Ctrl+V 粘贴图片附件]";
    }

    [RelayCommand]
    private async Task SendMessageAsync()
    {
        if (string.IsNullOrWhiteSpace(InputText) || IsBusy) return;

        var userMsg = InputText;
        if (!string.IsNullOrEmpty(ReplyingToMessage))
        {
            userMsg = $"> {ReplyingToMessage.Replace("\n", "\n> ")}\n\n{userMsg}";
            ReplyingToMessage = null;
        }
        
        InputText = string.Empty;
        IsBusy = true;
        
        var attachments = PendingAttachments.ToArray();
        PendingAttachments.Clear();
        
        // Ensure mermaid is used if requested
        string systemMsgExtension = "";
        if (userMsg.Contains("时序图") || userMsg.Contains("流程图") || userMsg.Contains("架构图"))
        {
            systemMsgExtension = "\n(System Prompt Extension: 请务必严格使用 Markdown 的 ```mermaid 代码块来输出时序图、流程图或架构图，不要使用普通文本或表格！)";
        }
        
        string skillId = SelectedSkill?.Id ?? "general_assistant";

        ChatMessages.Add(new ChatMessage { Role = "User", Content = userMsg, Attachments = attachments });

        TraceEvents.Clear();
        RawLogs = string.Empty;
        TraceEvents.Add(new TraceEvent { Description = "指令下发", IconType = "User", IsCompleted = true, IsLast = true });

        try
        {
            var requestBody = new { 
                message = userMsg + systemMsgExtension, 
                session_id = CurrentSessionId,
                skill_id = skillId,
                thinking_depth = GetThinkingDepthValue(),
                context_length = GetContextLengthValue(),
                use_knowledge = UseKnowledge,
                permission_mode = GetPermissionModeValue(),
                attachments = attachments
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

                RawLogs += line + "\n";

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
                            Dispatcher.UIThread.Post(() => {
                                currentAgentMsg.Content += token;
                                MessageUpdated?.Invoke(this, EventArgs.Empty);
                            });
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
                                MessageUpdated?.Invoke(this, EventArgs.Empty);
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
                    else if (type == "approval_request")
                    {
                        var approvalId = dataObj.GetProperty("approval_id").GetString();
                        var msg = dataObj.GetProperty("message").GetString();
                        var input = dataObj.GetProperty("input").GetString();
                        Dispatcher.UIThread.Post(() => {
                            PendingApprovalId = approvalId ?? "";
                            PendingApprovalMessage = $"{msg}\n\n参数:\n{input}";
                            IsApprovalDialogVisible = true;
                        });
                    }
                    else if (type == "tool_start" || type == "tool_end" || type == "llm_start" || type == "llm_end")
                    {
                        if (dataObj.TryGetProperty("message", out var msgProp))
                        {
                            var msg = msgProp.GetString();
                            if (!string.IsNullOrEmpty(msg))
                            {
                                string icon = "Play";
                                if (type.Contains("tool")) icon = "Key";
                                else if (type.Contains("llm")) icon = "Bot";
                                
                                Dispatcher.UIThread.Post(() => {
                                    if (type.EndsWith("_end") && TraceEvents.Count > 0) {
                                        TraceEvents[TraceEvents.Count - 1].IsCompleted = true;
                                        // Update description to end message if desired, or keep start message
                                        // TraceEvents[TraceEvents.Count - 1].Description = msg;
                                    } else {
                                        if (TraceEvents.Count > 0) {
                                            TraceEvents[TraceEvents.Count - 1].IsLast = false;
                                        }
                                        TraceEvents.Add(new TraceEvent { 
                                            Description = msg, 
                                            IconType = icon, 
                                            IsCompleted = false,
                                            IsLast = true 
                                        });
                                    }
                                });
                            }
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

    [ObservableProperty]
    private string[]? _attachments;
}

public partial class TraceEvent : ObservableObject
{
    [ObservableProperty]
    private string _type = string.Empty;

    [ObservableProperty]
    private string _timestamp = string.Empty;

    [ObservableProperty]
    private string _description = string.Empty;

    [ObservableProperty]
    private string _iconType = "User";

    [ObservableProperty]
    private bool _isCompleted = false;

    [ObservableProperty]
    private bool _isLast = false;
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

public partial class ChatSession : ObservableObject
{
    [ObservableProperty]
    private string _sessionId = string.Empty;

    [ObservableProperty]
    private string _title = string.Empty;

    [ObservableProperty]
    private string _createdAt = string.Empty;
}
