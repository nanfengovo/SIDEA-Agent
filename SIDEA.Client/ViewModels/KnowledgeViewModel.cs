using System;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SIDEA.Client.Services;

namespace SIDEA.Client.ViewModels;

public class DocumentItem
{
    public string DocId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string FileType { get; set; } = string.Empty;
    public long SizeKB { get; set; }
    public int VectorChunks { get; set; }
    public string Status { get; set; } = "已切片与向量化";
    public string UploadTime { get; set; } = string.Empty;
}

public class VectorItem
{
    public string VectorId { get; set; } = string.Empty;
    public string TextSnippet { get; set; } = string.Empty;
    public string VectorDimension { get; set; } = "384-D Float32";
    public double SimilarityScore { get; set; } = 0.92;
}

public class ExperienceItem
{
    public string ExpId { get; set; } = string.Empty;
    public string Context { get; set; } = string.Empty;
    public string Rule { get; set; } = string.Empty;
    public string Status { get; set; } = "UNREVIEWED";
}

public partial class KnowledgeViewModel : ViewModelBase
{
    public ObservableCollection<DocumentItem> Documents { get; } = new();
    public ObservableCollection<VectorItem> Vectors { get; } = new();
    public ObservableCollection<ExperienceItem> Experiences { get; } = new();

    [ObservableProperty]
    private string _searchQuery = string.Empty;

    [ObservableProperty]
    private string _vectorTestQuery = string.Empty;

    [ObservableProperty]
    private string _autoRulePrompt = "请评估输入的排查经验是否包含明确的工业设备型号、故障现象与针对性解决方案。如果满足则自动入库。";

    public KnowledgeViewModel()
    {
        LoadInitialData();
    }

    [RelayCommand]
    public async Task RefreshDocumentsAsync()
    {
        var docs = await ApiClient.GetKnowledgeDocumentsAsync();
        if (docs != null && docs.Count > 0)
        {
            Documents.Clear();
            foreach (var d in docs)
            {
                Documents.Add(new DocumentItem
                {
                    DocId = d.TryGetValue("id", out var id) ? id.ToString() ?? "" : "",
                    Name = d.TryGetValue("name", out var name) ? name.ToString() ?? "" : "",
                    FileType = d.TryGetValue("type", out var type) ? type.ToString() ?? "" : "PDF",
                    SizeKB = 128,
                    VectorChunks = 32,
                    Status = "已处理",
                    UploadTime = DateTime.Now.ToString("yyyy-MM-dd HH:mm")
                });
            }
        }
    }

    [RelayCommand]
    public async Task SearchVectorsAsync()
    {
        if (string.IsNullOrWhiteSpace(VectorTestQuery)) return;
        var results = await ApiClient.SearchKnowledgeVectorsAsync(VectorTestQuery);
        if (results != null)
        {
            Vectors.Clear();
            foreach (var r in results)
            {
                Vectors.Add(new VectorItem
                {
                    VectorId = r.TryGetValue("id", out var id) ? id.ToString() ?? "" : "V-1",
                    TextSnippet = r.TryGetValue("snippet", out var snip) ? snip.ToString() ?? "" : VectorTestQuery,
                    SimilarityScore = 0.95
                });
            }
        }
    }

    [RelayCommand]
    public async Task ApproveExperienceAsync(ExperienceItem item)
    {
        if (item == null) return;
        await ApiClient.ApproveExperienceAsync(item.ExpId);
        item.Status = "APPROVED";
        await RefreshExperiencesAsync();
    }

    [RelayCommand]
    public async Task RejectExperienceAsync(ExperienceItem item)
    {
        if (item == null) return;
        await ApiClient.RejectExperienceAsync(item.ExpId);
        item.Status = "REJECTED";
        await RefreshExperiencesAsync();
    }

    [RelayCommand]
    public async Task RefreshExperiencesAsync()
    {
        var exps = await ApiClient.GetKnowledgeExperiencesAsync();
        if (exps != null && exps.Count > 0)
        {
            Experiences.Clear();
            foreach (var e in exps)
            {
                Experiences.Add(new ExperienceItem
                {
                    ExpId = e.TryGetValue("id", out var id) ? id.ToString() ?? "" : "",
                    Context = e.TryGetValue("context", out var c) ? c.ToString() ?? "" : "",
                    Rule = e.TryGetValue("rule", out var r) ? r.ToString() ?? "" : "",
                    Status = e.TryGetValue("status", out var s) ? s.ToString() ?? "UNREVIEWED" : "UNREVIEWED"
                });
            }
        }
    }

    [RelayCommand]
    public async Task SaveAutoRulesAsync()
    {
        await ApiClient.SaveKnowledgeRulesAsync(AutoRulePrompt);
    }

    private void LoadInitialData()
    {
        Documents.Add(new DocumentItem { DocId = "DOC-01", Name = "AMR_RCS_通信协议说明书.pdf", FileType = "PDF", SizeKB = 1420, VectorChunks = 48, Status = "已向量化", UploadTime = "2026-07-20 10:30" });
        Documents.Add(new DocumentItem { DocId = "DOC-02", Name = "E-402电机过热排查指南.docx", FileType = "DOCX", SizeKB = 512, VectorChunks = 16, Status = "已向量化", UploadTime = "2026-07-21 14:15" });
        Documents.Add(new DocumentItem { DocId = "DOC-03", Name = "厂区AGV地图坐标与拓扑.xlsx", FileType = "EXCEL", SizeKB = 2048, VectorChunks = 64, Status = "已向量化", UploadTime = "2026-07-22 09:00" });

        Vectors.Add(new VectorItem { VectorId = "VEC-1001", TextSnippet = "AMR 升降电机报警代码 E-402 代表驱动器温度超 85℃，建议检查风机运行与散通道", SimilarityScore = 0.96 });
        Vectors.Add(new VectorItem { VectorId = "VEC-1002", TextSnippet = "激光雷达遮挡代码 F-108 时，先清理前窗口光学透镜并重新对齐反射板点云", SimilarityScore = 0.91 });

        Experiences.Add(new ExperienceItem { ExpId = "EXP-01", Context = "AMR-01 在 2号站点举升频繁超温报警，现场更换散热风机后恢复", Rule = "若 AMR-01 举升超温，优先检查风机转速与积灰", Status = "待审核" });
        Experiences.Add(new ExperienceItem { ExpId = "EXP-02", Context = "潜伏顶升车定位偏差 > 15mm，重塑雷达点云图谱后精度恢复 2mm", Rule = "定位偏差大时执行激光雷达点云重塑", Status = "已入库" });
    }
}
