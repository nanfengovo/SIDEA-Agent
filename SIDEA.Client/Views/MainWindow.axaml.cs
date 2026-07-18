using System;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using System.Collections.Specialized;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Threading;
using SIDEA.Client.ViewModels;

namespace SIDEA.Client.Views;

public partial class MainWindow : Window
{
    private bool _isUpdatePending = false;

    private void RequestUpdateWebViewMessages()
    {
        if (_isUpdatePending) return;
        _isUpdatePending = true;
        Dispatcher.UIThread.Post(async () => {
            await Task.Delay(100);
            _isUpdatePending = false;
            UpdateWebViewMessages();
        });
    }

    public MainWindow()
    {
        InitializeComponent();
        
        try 
        {
            var htmlPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Assets", "chat_renderer.html");
            ChatWebView.Source = new Uri($"file://{htmlPath}");
            
            var traceHtmlPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Assets", "trace_renderer.html");
            TraceWebView.Source = new Uri($"file://{traceHtmlPath}");
            
            // Try setting transparent background if supported by NativeWebView
            var property = typeof(NativeWebView).GetProperty("DefaultBackgroundColor");
            if (property != null && property.CanWrite)
            {
                property.SetValue(ChatWebView, Avalonia.Media.Colors.Transparent);
                property.SetValue(TraceWebView, Avalonia.Media.Colors.Transparent);
            }
            
            ChatWebView.WebMessageReceived += (s, e) => {
                try {
                    dynamic dynamicEventArgs = e;
                    string msgString = dynamicEventArgs.WebMessageAsJson;
                    if (string.IsNullOrEmpty(msgString)) {
                        msgString = dynamicEventArgs.WebMessageAsString;
                    }
                    if (!string.IsNullOrEmpty(msgString)) {
                        using var doc = JsonDocument.Parse(msgString);
                        var root = doc.RootElement;
                        if (root.TryGetProperty("type", out var typeProp)) {
                            string type = typeProp.GetString() ?? "";
                            if (type == "copy") {
                                var text = root.GetProperty("text").GetString();
                                var clipboard = TopLevel.GetTopLevel(this)?.Clipboard;
                                if (clipboard != null && text != null) {
                                    _ = clipboard.SetTextAsync(text);
                                }
                                return;
                            } else if (type == "reply") {
                                var text = root.GetProperty("text").GetString();
                                if (DataContext is MainWindowViewModel vm) {
                                    Dispatcher.UIThread.Post(() => vm.ReplyingToMessage = text);
                                }
                                return;
                            } else if (type == "send") {
                                var text = root.GetProperty("text").GetString();
                                if (DataContext is MainWindowViewModel vm && text != null) {
                                    Dispatcher.UIThread.Post(() => {
                                        vm.InputText = text;
                                        if (vm.SendMessageCommand.CanExecute(null)) {
                                            vm.SendMessageCommand.Execute(null);
                                        }
                                    });
                                }
                                return;
                            }
                        }
                    }
                } catch { }
                RequestUpdateWebViewMessages();
            };
        } 
        catch (Exception ex)
        {
            Console.WriteLine("WebView Error: " + ex.Message);
        }

        this.DataContextChanged += (s, e) =>
        {
            if (DataContext is MainWindowViewModel vm)
            {
                vm.ChatMessages.CollectionChanged += (s2, e2) => RequestUpdateWebViewMessages();
                vm.MessageUpdated += (s2, e2) => RequestUpdateWebViewMessages();
                vm.TraceEvents.CollectionChanged += (s2, e2) => Dispatcher.UIThread.Post(UpdateTraceWebView);
                vm.PropertyChanged += (s2, e2) => {
                    if (e2.PropertyName == nameof(vm.RawLogs)) {
                        Dispatcher.UIThread.Post(UpdateTraceWebView);
                    }
                };
                vm.ThemeChanged += (s2, isLight) => Dispatcher.UIThread.Post(() => {
                    try { 
                        ChatWebView.InvokeScript($"toggleTheme({isLight.ToString().ToLower()})"); 
                        TraceWebView.InvokeScript($"toggleTheme({isLight.ToString().ToLower()})"); 
                    } catch { }
                });
            }
        };
    }

    private void UpdateWebViewMessages()
    {
        if (DataContext is MainWindowViewModel vm)
        {
            try {
                // Serialize just the array, not the wrapper object, because renderMessages expects an array
                var json = JsonSerializer.Serialize(vm.ChatMessages);
                
                ChatWebView.InvokeScript($"renderMessages({json})");
            } catch (Exception ex) { 
                Console.WriteLine($"[WebView] Update Error: {ex.Message}"); 
            }
        }
    }

    private void UpdateTraceWebView()
    {
        if (DataContext is MainWindowViewModel vm)
        {
            try {
                var jsonTrace = JsonSerializer.Serialize(vm.TraceEvents);
                var payloadTrace = JsonSerializer.Serialize(new { type = "update_trace", events = vm.TraceEvents });
                TraceWebView.InvokeScript($"window.postMessage({payloadTrace}, '*')");
                
                var payloadLog = JsonSerializer.Serialize(new { type = "update_log", logs = vm.RawLogs });
                TraceWebView.InvokeScript($"window.postMessage({payloadLog}, '*')");
            } catch (Exception ex) { 
                Console.WriteLine($"[TraceWebView] Update Error: {ex.Message}"); 
            }
        }
    }

    private async void OnInputKeyDown(object? sender, KeyEventArgs e)
    {
        if (DataContext is MainWindowViewModel vm)
        {
            if (e.Key == Key.V && (e.KeyModifiers.HasFlag(KeyModifiers.Control) || e.KeyModifiers.HasFlag(KeyModifiers.Meta)))
            {
                var clipboard = TopLevel.GetTopLevel(this)?.Clipboard;
                if (clipboard != null)
                {
                    var formats = await clipboard.GetFormatsAsync();
                    if (formats != null && (System.Linq.Enumerable.Contains(formats, "image/png") || System.Linq.Enumerable.Contains(formats, "image/jpeg") || System.Linq.Enumerable.Contains(formats, "PNG") || System.Linq.Enumerable.Contains(formats, "image/bmp")))
                    {
                        var data = await clipboard.GetDataAsync(System.Linq.Enumerable.FirstOrDefault(formats, f => f.Contains("image")));
                        if (data != null)
                        {
                            e.Handled = true;
                            // Trigger upload in ViewModel via a new public method
                            await vm.UploadImageFromClipboardAsync(data);
                            return;
                        }
                    }
                }
            }

            if (e.Key == Key.Enter && (e.KeyModifiers & KeyModifiers.Shift) == 0)
            {
                if (vm.SendMessageCommand.CanExecute(null))
                {
                    e.Handled = true;
                    vm.SendMessageCommand.Execute(null);
                }
            }
        }
    }

    private void OnAdminButtonClicked(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        var adminWindow = new AdminWindow();
        adminWindow.ShowDialog(this);
    }
}