import { BG, FG, FONT } from './theme.js';

/**
 * Builds an array of Google Docs API batchUpdate requests to insert a
 * syntax-highlighted code block at the given document index.
 *
 * Processing order matters for index arithmetic — the caller must
 * process paragraphs bottom-up (highest startIndex first) so that
 * earlier insertions don't shift later indices.
 *
 * @param {number} paragraphStartIndex  - startIndex of the paragraph in the doc
 * @param {string} rawCode              - plain text of the code
 * @param {Array<{text: string, color: string}>} tokens
 * @returns {Array<object>} Docs API request objects
 */
export function buildDocsRequests(paragraphStartIndex, rawCode, tokens) {
  const requests = [];

  // 1. Insert a 1×1 table just before the paragraph
  requests.push({
    insertTable: {
      rows: 1,
      columns: 1,
      location: { index: paragraphStartIndex },
    },
  });

  // After insertTable, the table occupies the paragraph's position.
  // A 1×1 table structure in Docs adds:
  //   [tableStart=paragraphStartIndex+1]
  //   [rowStart=paragraphStartIndex+2]
  //   [cellStart=paragraphStartIndex+3]
  //   [cellContentStart=paragraphStartIndex+4]  ← first writable index inside cell
  //   [implicit empty paragraph inside cell]
  // We insert text starting at cellContentStart.
  const cellContentStart = paragraphStartIndex + 4;

  // 2. Insert the raw code text into the cell (as one insertText)
  requests.push({
    insertText: {
      location: { index: cellContentStart },
      text: rawCode,
    },
  });

  // 3. Apply per-token foreground colors and font
  let cursor = cellContentStart;
  for (const { text, color } of tokens) {
    const end = cursor + text.length;
    if (cursor < end) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: cursor, endIndex: end },
          textStyle: {
            foregroundColor: { color: { rgbColor: hexToRgb(color) } },
            weightedFontFamily: { fontFamily: 'Consolas' },
            fontSize: { magnitude: 11, unit: 'PT' },
          },
          fields: 'foregroundColor,weightedFontFamily,fontSize',
        },
      });
    }
    cursor = end;
  }

  // 4. Apply dark background to the entire text range
  const textEnd = cellContentStart + rawCode.length;
  requests.push({
    updateTextStyle: {
      range: { startIndex: cellContentStart, endIndex: textEnd },
      textStyle: {
        backgroundColor: { color: { rgbColor: hexToRgb(BG) } },
      },
      fields: 'backgroundColor',
    },
  });

  // 5. Style the table cell — dark background, padding
  // The cell range covers indices paragraphStartIndex+3 to paragraphStartIndex+3+content
  requests.push({
    updateTableCellStyle: {
      tableCellStyle: {
        backgroundColor: { color: { rgbColor: hexToRgb(BG) } },
        paddingTop: { magnitude: 10, unit: 'PT' },
        paddingBottom: { magnitude: 10, unit: 'PT' },
        paddingLeft: { magnitude: 14, unit: 'PT' },
        paddingRight: { magnitude: 14, unit: 'PT' },
      },
      tableRange: {
        tableCellLocation: {
          tableStartLocation: { index: paragraphStartIndex + 1 },
          rowIndex: 0,
          columnIndex: 0,
        },
        rowSpan: 1,
        columnSpan: 1,
      },
      fields: 'backgroundColor,paddingTop,paddingBottom,paddingLeft,paddingRight',
    },
  });

  // 6. Remove table borders by setting zero-width borders on the table
  requests.push({
    updateTableColumnProperties: {
      tableStartLocation: { index: paragraphStartIndex + 1 },
      columnIndices: [0],
      tableColumnProperties: {
        widthType: 'EVENLY_DISTRIBUTED',
      },
      fields: 'widthType',
    },
  });

  return requests;
}

/** Converts '#rrggbb' to {red, green, blue} in 0–1 range */
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { red: r, green: g, blue: b };
}
