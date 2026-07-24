using System;
using System.IO;
using Avalonia.Controls;

namespace SIDEA.Client.Views;

public partial class KnowledgeWindow : Window
{
    public KnowledgeWindow()
    {
        InitializeComponent();
        try
        {
            var htmlPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Assets", "graph_rag_renderer.html");
            GraphRagWebView.Source = new Uri($"file://{htmlPath}");
        }
        catch (Exception ex)
        {
            Console.WriteLine("Graph RAG WebView error: " + ex.Message);
        }
    }
}
