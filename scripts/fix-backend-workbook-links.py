#!/usr/bin/env python3
import sys
import shutil
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"

ET.register_namespace("", NS_MAIN)
ET.register_namespace("r", NS_REL)


def sheet_target_map(zf: zipfile.ZipFile):
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall(f"{{{NS_PKG_REL}}}Relationship")
    }
    sheets = {}
    for sheet in workbook.find(f"{{{NS_MAIN}}}sheets"):
        name = sheet.attrib["name"]
        rel_id = sheet.attrib[f"{{{NS_REL}}}id"]
        target = rel_map[rel_id]
        if target.startswith("/"):
            target = target.lstrip("/")
        if not target.startswith("xl/"):
            target = f"xl/{target}"
        sheets[name] = target
    return sheets


def load_sheet_root(zf: zipfile.ZipFile, target: str):
    return ET.fromstring(zf.read(target))


def write_sheet_root(root: ET.Element) -> bytes:
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def patch_api_sheet(root: ET.Element):
    ns = {"a": NS_MAIN}
    sheet_data = root.find("a:sheetData", ns)
    if sheet_data is None:
        return
    for cf in list(root.findall("a:conditionalFormatting", ns)):
        root.remove(cf)
    for row in sheet_data.findall("a:row", ns):
        for cell in row.findall("a:c", ns):
            ref = cell.attrib.get("r")
            if ref and ref.startswith("C") and 5 <= int(ref[1:]) <= 16:
                for child in list(cell):
                    if child.tag in {f"{{{NS_MAIN}}}f"}:
                        cell.remove(child)


def patch_table_sheet(root: ET.Element):
    ns = {"a": NS_MAIN}
    sheet_data = root.find("a:sheetData", ns)
    if sheet_data is None:
        return
    for cf in list(root.findall("a:conditionalFormatting", ns)):
        root.remove(cf)

    hyperlinks = root.find("a:hyperlinks", ns)
    if hyperlinks is None:
        hyperlinks = ET.Element(f"{{{NS_MAIN}}}hyperlinks")
        insert_after = root.find("a:pageMargins", ns)
        if insert_after is None:
            root.append(hyperlinks)
        else:
            children = list(root)
            idx = children.index(insert_after)
            root.insert(idx, hyperlinks)
    else:
        for child in list(hyperlinks):
            hyperlinks.remove(child)

    targets = {
        "C5": "catalog",
        "C6": "ingest_job",
        "C7": "ingest_item",
        "C8": "sync_log",
        "C9": "bucket_state",
        "C10": "image_object",
        "C11": "thumbnail_object",
        "C12": "raw_json_object",
    }

    for row in sheet_data.findall("a:row", ns):
        for cell in row.findall("a:c", ns):
            ref = cell.attrib.get("r")
            if ref in targets:
                for child in list(cell):
                    if child.tag in {f"{{{NS_MAIN}}}f"}:
                        cell.remove(child)
                cell.attrib["t"] = "str"
                if not any(child.tag == f"{{{NS_MAIN}}}v" for child in cell):
                    v = ET.SubElement(cell, f"{{{NS_MAIN}}}v")
                    v.text = targets[ref]
                cell_value = targets[ref]
                cell.attrib.pop("cm", None)
                ET.SubElement(
                    hyperlinks,
                    f"{{{NS_MAIN}}}hyperlink",
                    {
                        "ref": ref,
                        "location": f"'{cell_value}'!A1",
                        "display": cell_value,
                    },
                )


def patch_workbook(path: Path, mode: str):
    with zipfile.ZipFile(path, "r") as zin, tempfile.NamedTemporaryFile(delete=False) as tmp:
        sheet_map = sheet_target_map(zin)
        target_sheet = "목차" if mode == "api" else "테이블목록"
        target_path = sheet_map[target_sheet]
        root = load_sheet_root(zin, target_path)
        if mode == "api":
            patch_api_sheet(root)
        elif mode == "table":
            patch_table_sheet(root)
        else:
            raise SystemExit(f"Unknown mode: {mode}")

        with zipfile.ZipFile(tmp.name, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename == target_path:
                    data = write_sheet_root(root)
                zout.writestr(item, data)

    shutil.move(tmp.name, path)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: fix-backend-workbook-links.py <xlsx-path> <api|table>")
    patch_workbook(Path(sys.argv[1]), sys.argv[2])


if __name__ == "__main__":
    main()
