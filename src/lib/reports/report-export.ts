const PdfPrinter = require('pdfmake')
import ExcelJS from 'exceljs'
import { formatINR } from './money'

// Define standard fonts for pdfmake
const fonts = {
  Roboto: {
    normal: 'node_modules/pdfmake/build/vfs_fonts.js', // We usually need to load fonts, but since we are server side, we can just use standard Helvetica
    bold: 'node_modules/pdfmake/build/vfs_fonts.js',
    italics: 'node_modules/pdfmake/build/vfs_fonts.js',
    bolditalics: 'node_modules/pdfmake/build/vfs_fonts.js'
  },
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
}

export async function generatePDFBuffer(
  title: string,
  companyName: string,
  filters: any,
  headers: string[],
  rows: any[][],
  summary?: { label: string; value: string }[]
): Promise<Buffer> {
  const printer = new PdfPrinter(fonts)

  const docDefinition: any = {
    defaultStyle: {
      font: 'Helvetica',
      fontSize: 10
    },
    header: {
      columns: [
        { text: companyName, style: 'headerCompany', margin: [40, 20, 0, 0] },
        { text: 'Generated: ' + new Date().toLocaleDateString('en-IN'), alignment: 'right', margin: [0, 20, 40, 0] }
      ]
    },
    footer: function(currentPage: number, pageCount: number) {
      return { text: `Page ${currentPage} of ${pageCount}`, alignment: 'center', margin: [0, 10, 0, 0] }
    },
    content: [
      { text: title, style: 'headerTitle', margin: [0, 20, 0, 10] },
      { text: 'Filters Applied: ' + JSON.stringify(filters), style: 'filters', margin: [0, 0, 0, 20] }
    ],
    styles: {
      headerCompany: { fontSize: 14, bold: true, color: '#13558e' },
      headerTitle: { fontSize: 18, bold: true },
      filters: { fontSize: 9, color: '#647387' },
      summaryLabel: { bold: true },
      tableHeader: { bold: true, fillColor: '#f2f5f8', color: '#16273a' }
    }
  }

  if (summary && summary.length > 0) {
    docDefinition.content.push({
      columns: summary.map(s => ({
        stack: [
          { text: s.label, style: 'summaryLabel' },
          { text: s.value, margin: [0, 5, 0, 0] }
        ]
      })),
      margin: [0, 0, 0, 20]
    })
  }

  const tableBody = [
    headers.map(h => ({ text: h, style: 'tableHeader' })),
    ...rows.map(row => row.map(cell => cell?.toString() || ''))
  ]

  docDefinition.content.push({
    table: {
      headerRows: 1,
      widths: headers.map(() => '*'), // distribute evenly
      body: tableBody
    },
    layout: 'lightHorizontalLines'
  })

  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(docDefinition)
      const chunks: Buffer[] = []
      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk))
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
      pdfDoc.on('error', reject)
      pdfDoc.end()
    } catch (e) {
      reject(e)
    }
  })
}

export async function generateExcelBuffer(
  title: string,
  companyName: string,
  filters: any,
  headers: string[],
  rows: any[][]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = companyName
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(title.substring(0, 31))

  // Add Title
  sheet.addRow([companyName])
  sheet.addRow([title])
  sheet.addRow(['Generated:', new Date().toLocaleString('en-IN')])
  sheet.addRow(['Filters:', JSON.stringify(filters)])
  sheet.addRow([])

  // Add Headers
  const headerRow = sheet.addRow(headers)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF2F5F8' }
  }

  // Add Rows
  rows.forEach(row => {
    sheet.addRow(row)
  })

  // Format columns
  sheet.columns.forEach(column => {
    column.width = 20
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return buffer as Buffer
}
