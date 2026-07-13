import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel } from "docx";
import { saveAs } from "file-saver";

export interface ExportEntry {
  id: string;
  date: string;
  project_name: string;
  category: string;
  bill_name: string;
  reason: string;
  advance_amount: number;
  expenditure_amount: number;
  raised_by_name: string;
  entered_by_name?: string;
  receipt_url?: string;
}

export const exportPettyCashToWord = async (entries: ExportEntry[], imageFetcher?: (url: string) => Promise<{ arrayBuffer: ArrayBuffer, type: "jpg" | "png" | "gif" | "bmp", width?: number, height?: number } | null>) => {
  const children: any[] = [];

  children.push(
    new Paragraph({
      text: "Petty Cash Receipts",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  const entriesWithReceipts = entries.filter(e => e.receipt_url);

  for (let i = 0; i < entriesWithReceipts.length; i++) {
    const entry = entriesWithReceipts[i];

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Date: `, bold: true }),
          new TextRun({ text: `${entry.date}` }),
          new TextRun({ text: `Amount: `, bold: true, break: 1 }),
          new TextRun({ text: `Rs. ${entry.expenditure_amount || 0}` }),
          new TextRun({ text: `Reason: `, bold: true, break: 1 }),
          new TextRun({ text: `${entry.reason || "-"}` }),
        ],
        spacing: { after: 200 },
      })
    );

    if (entry.receipt_url) {
      try {
        let imageData: { arrayBuffer: ArrayBuffer, type: "jpg" | "png" | "gif" | "bmp" } | null = null;
        
        if (imageFetcher) {
          imageData = await imageFetcher(entry.receipt_url);
        } else {
          const response = await fetch(entry.receipt_url, { mode: 'cors' });
          if (response.ok) {
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            let type: "jpg" | "png" | "gif" | "bmp" = "jpg";
            if (blob.type.includes("png")) type = "png";
            else if (blob.type.includes("gif")) type = "gif";
            else if (blob.type.includes("bmp")) type = "bmp";
            imageData = { arrayBuffer, type };
          } else {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
        }

        if (imageData) {
          let calcWidth = 500;
          let calcHeight = 500;
          const img = imageData as any;
          if (img.width && img.height) {
            calcHeight = Math.round((500 / img.width) * img.height);
          }

          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: imageData.arrayBuffer,
                  transformation: {
                    width: calcWidth,
                    height: calcHeight,
                  },
                  type: imageData.type,
                }),
              ],
            })
          );
        } else {
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "[Receipt Image Unavailable]",
                  color: "FF0000",
                }),
              ],
            })
          );
        }
      } catch (error) {
        console.error(`Failed to load image for entry ${entry.id}`, error);
        children.push(
          new Paragraph({
            text: "(Failed to load receipt image)",
            alignment: AlignmentType.CENTER,
          })
        );
      }
    }

    children.push(new Paragraph({ spacing: { after: 400 } }));
    
    if (i !== entriesWithReceipts.length - 1) {
      children.push(
        new Paragraph({
          pageBreakBefore: true,
        })
      );
    }
  }

  if (entriesWithReceipts.length === 0) {
      children.push(
          new Paragraph({
              text: "No receipts found for the selected entries.",
              alignment: AlignmentType.CENTER,
          })
      );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Receipts_Export_${new Date().toISOString().split("T")[0]}.docx`);
};
