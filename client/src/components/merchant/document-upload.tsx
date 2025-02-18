
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export function DocumentUpload({ contractId }: { contractId: number }) {
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append("document", file);
    formData.append("contractId", contractId.toString());

    try {
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Document uploaded successfully",
        });
        setFile(null);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload document",
        variant: "destructive",
      });
    }
  };

  return (
    <form onSubmit={handleUpload} className="space-y-4">
      <Input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
      />
      <Button type="submit" disabled={!file}>
        Upload Document
      </Button>
    </form>
  );
}
