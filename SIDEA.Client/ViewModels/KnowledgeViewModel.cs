using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;

namespace SIDEA.Client.ViewModels;

public partial class KnowledgeViewModel : ViewModelBase
{
    public ObservableCollection<DocumentItem> Documents { get; } = new();
    public ObservableCollection<ExperienceItem> Experiences { get; } = new();

    public KnowledgeViewModel()
    {
        Documents.Add(new DocumentItem { 
            Name = "调度外包http接口.pdf", 
            FileType = "pdf", 
            SizeKB = 245.6, 
            VectorChunks = 10, 
            Status = "已入库", 
            UploadTime = "2026-07-17 15:43" 
        });

        Experiences.Add(new ExperienceItem { 
            Context = "User: Error 404 on Node A",
            Rule = "Check network connection between Node A and Switch 1.",
            Status = "待审核"
        });
    }
}

public class DocumentItem
{
    public string Name { get; set; } = string.Empty;
    public string FileType { get; set; } = string.Empty;
    public double SizeKB { get; set; }
    public int VectorChunks { get; set; }
    public string Status { get; set; } = string.Empty;
    public string UploadTime { get; set; } = string.Empty;
}

public class ExperienceItem
{
    public string Context { get; set; } = string.Empty;
    public string Rule { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
}
