import QRCode from "qrcode";

export async function qrCodeSvg(text: string, size = 72): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    width: size,
    margin: 0,
    color: {
      dark: "#171813",
      light: "#00000000",
    },
  });
}
