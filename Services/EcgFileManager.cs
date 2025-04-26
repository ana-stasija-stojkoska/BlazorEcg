namespace LiveEcgChart.Services
{
    public class EcgFileManager
    {
        public List<string> EcgFiles { get; private set; } = new();
        public int CurrentFileIndex { get; private set; } = 0;

        public string CurrentFileName => EcgFiles.Count > 0
            ? Path.GetFileNameWithoutExtension(EcgFiles[CurrentFileIndex])
            : "No File";

        public bool HasNextFile => CurrentFileIndex < EcgFiles.Count - 1;
        public bool HasPreviousFile => CurrentFileIndex > 0;

        public EcgFileManager()
        {
            var ecgDirectory = Path.Combine("wwwroot", "EcgData");
            if (Directory.Exists(ecgDirectory))
            {
                EcgFiles = Directory.GetFiles(ecgDirectory, "*.ecg").ToList();
            }
        }

        public void NextFile()
        {
            if (HasNextFile) CurrentFileIndex++;
        }

        public void PreviousFile()
        {
            if (HasPreviousFile) CurrentFileIndex--;
        }

        public void SetCurrentFileIndex(int index)
        {
            if (index >= 0 && index < EcgFiles.Count)
            {
                CurrentFileIndex = index;
            }
        }
    }
}
