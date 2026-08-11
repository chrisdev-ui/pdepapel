from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


PAGE_WIDTH, PAGE_HEIGHT = A4
ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = ROOT / "output/pdf/guia-practica-mercadolibre-p-de-papel.pdf"

NAVY = HexColor("#1F1A4E")
BLUE = HexColor("#376CDB")
YELLOW = HexColor("#FFE600")
PINK = HexColor("#FF6B9A")
TEXT = HexColor("#283253")
MUTED = HexColor("#62718D")
BORDER = HexColor("#D9DFEA")
SOFT_BLUE = HexColor("#EEF4FF")
SOFT_YELLOW = HexColor("#FFF9D6")
SOFT_PINK = HexColor("#FFF0F5")
SOFT_GREEN = HexColor("#EAF8F0")
GREEN = HexColor("#188B57")
RED = HexColor("#C53C61")


def split_lines(value: str, font: str, size: float, width: float) -> list[str]:
    words = value.split()
    lines: list[str] = []
    current = ""

    for word in words:
        candidate = f"{current} {word}".strip()
        if current and stringWidth(candidate, font, size) > width:
            lines.append(current)
            current = word
        else:
            current = candidate

    if current:
        lines.append(current)

    return lines


def draw_paragraph(
    pdf: canvas.Canvas,
    value: str,
    x: float,
    y: float,
    width: float,
    font: str = "Helvetica",
    size: float = 10,
    leading: float = 14,
    color=TEXT,
) -> float:
    pdf.setFont(font, size)
    pdf.setFillColor(color)
    for line in split_lines(value, font, size, width):
        pdf.drawString(x, y, line)
        y -= leading
    return y


def draw_footer(pdf: canvas.Canvas, page: int) -> None:
    pdf.setStrokeColor(BORDER)
    pdf.line(50, 34, PAGE_WIDTH - 50, 34)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 8.5)
    pdf.drawString(50, 21, "P de Papel | Guía práctica de Mercado Libre")
    pdf.drawRightString(PAGE_WIDTH - 50, 21, f"Página {page}")


def draw_section_header(pdf: canvas.Canvas, page: int, label: str, title: str, subtitle: str) -> float:
    pdf.setFillColor(PINK)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(50, PAGE_HEIGHT - 56, label.upper())
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 25)
    pdf.drawString(50, PAGE_HEIGHT - 88, title)
    y = draw_paragraph(pdf, subtitle, 50, PAGE_HEIGHT - 111, PAGE_WIDTH - 100, size=11, leading=15, color=MUTED)
    pdf.setStrokeColor(BORDER)
    pdf.line(50, y - 7, PAGE_WIDTH - 50, y - 7)
    draw_footer(pdf, page)
    return y - 29


def draw_numbered_step(pdf: canvas.Canvas, number: int, title: str, body: str, y: float) -> float:
    pdf.setFillColor(BLUE)
    pdf.circle(66, y - 3, 14, fill=1, stroke=0)
    pdf.setFillColor(white)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawCentredString(66, y - 7, str(number))
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(92, y + 2, title)
    end_y = draw_paragraph(pdf, body, 92, y - 17, PAGE_WIDTH - 142, size=10, leading=14, color=TEXT)
    return end_y - 14


def draw_card(pdf: canvas.Canvas, x: float, y: float, width: float, height: float, title: str, body: str, fill_color=white) -> None:
    pdf.setFillColor(fill_color)
    pdf.setStrokeColor(BORDER)
    pdf.roundRect(x, y - height, width, height, 8, fill=1, stroke=1)
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(x + 14, y - 22, title)
    draw_paragraph(pdf, body, x + 14, y - 42, width - 28, size=9.5, leading=13, color=TEXT)


def draw_note(pdf: canvas.Canvas, title: str, body: str, y: float, fill_color=SOFT_YELLOW, edge_color=YELLOW) -> float:
    lines = split_lines(body, "Helvetica", 10, PAGE_WIDTH - 132)
    height = max(72, 43 + len(lines) * 14)
    pdf.setFillColor(fill_color)
    pdf.setStrokeColor(BORDER)
    pdf.roundRect(50, y - height, PAGE_WIDTH - 100, height, 8, fill=1, stroke=1)
    pdf.setFillColor(edge_color)
    pdf.roundRect(50, y - height, 5, height, 3, fill=1, stroke=0)
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(70, y - 22, title)
    draw_paragraph(pdf, body, 70, y - 42, PAGE_WIDTH - 132, size=10, leading=14, color=TEXT)
    return y - height - 16


def cover_page(pdf: canvas.Canvas) -> None:
    pdf.setFillColor(PINK)
    pdf.setFont("Helvetica", 11)
    pdf.drawCentredString(PAGE_WIDTH / 2, PAGE_HEIGHT - 105, "P DE PAPEL X MERCADO LIBRE")

    logo_x = 150
    logo_y = PAGE_HEIGHT - 205
    logo_width = 295
    logo_height = 64
    pdf.setFillColor(YELLOW)
    pdf.rect(logo_x, logo_y, logo_width / 2, logo_height, fill=1, stroke=0)
    pdf.setFillColor(HexColor("#FFF3F7"))
    pdf.rect(logo_x + logo_width / 2, logo_y, logo_width / 2, logo_height, fill=1, stroke=0)
    pdf.setStrokeColor(BORDER)
    pdf.rect(logo_x, logo_y, logo_width, logo_height, fill=0, stroke=1)
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 30)
    pdf.drawCentredString(logo_x + logo_width / 4, logo_y + 20, "Mercado")
    pdf.drawCentredString(logo_x + logo_width * 0.75, logo_y + 20, "Libre")

    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 15)
    pdf.drawCentredString(PAGE_WIDTH / 2, PAGE_HEIGHT - 276, "Una guía simple para publicar, vender y cuidar el inventario desde P de Papel.")

    cards = [
        ("1. Publica", "Prepara un producto, revisa sus fotos y decide si guardarlo como borrador o publicarlo."),
        ("2. Vende", "Las ventas pagadas aparecen en P de Papel y descuentan existencias una sola vez."),
        ("3. Despacha", "Revisa ventas, guías y preguntas desde el centro de operaciones."),
        ("4. Mejora", "Guarda perfiles rápidos y revisa cada cambio antes de enviarlo."),
    ]
    start_y = PAGE_HEIGHT - 330
    for index, (title, body) in enumerate(cards):
        column = index % 2
        row = index // 2
        draw_card(pdf, 60 + column * 244, start_y - row * 112, 230, 92, title, body)

    draw_note(
        pdf,
        "Lo más importante",
        "P de Papel guarda el inventario real. Mercado Libre recibe la cantidad disponible con una pequeña reserva para ayudarte a no vender más de lo que tienes.",
        272,
    )
    draw_footer(pdf, 1)
    pdf.showPage()


def before_using_page(pdf: canvas.Canvas) -> None:
    y = draw_section_header(pdf, 2, "Paso 1", "Antes de usarlo", "Haz esta revisión rápida para trabajar con tranquilidad.")
    y = draw_numbered_step(pdf, 1, "Entra a Ventas -> Mercado Libre", "Comprueba que veas los estados Conectada y Procesamiento seguro activo. Si no los ves, no publiques: avisa a la persona responsable.", y)
    y = draw_numbered_step(pdf, 2, "Revisa el producto", "En Productos confirma nombre, existencias, precio de compra y fotografías claras. Si falta algo, complétalo primero.", y)
    y = draw_numbered_step(pdf, 3, "Decide el precio de Mercado Libre", "Puede ser diferente al de la tienda porque Mercado Libre cobra cargos. El valor sugerido es una ayuda: tú siempre puedes cambiarlo.", y)
    draw_note(pdf, "Ejemplo de reserva", "Hay 5 lapiceros en inventario y eliges una reserva de 1. Mercado Libre ofrecerá hasta 4. La otra unidad queda protegida si aparece una venta en otro canal.", y, SOFT_BLUE, BLUE)
    pdf.setFillColor(RED)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(50, 89, "Nunca compartas contraseñas, códigos de acceso ni datos de la cuenta vendedora.")
    pdf.showPage()


def publish_page(pdf: canvas.Canvas) -> None:
    y = draw_section_header(pdf, 3, "Paso 2", "Publicar un producto", "El asistente te acompaña. Nada se publica hasta que lo confirmes.")
    steps = [
        ("Empieza", "En Ventas -> Mercado Libre pulsa Preparar publicación y busca el producto local correcto. Mira nombre y fotografía para confirmarlo."),
        ("Precio y cantidad", "Escribe o revisa el precio de Mercado Libre y la reserva de seguridad. El precio de la tienda no cambia."),
        ("Categoría y fotos", "Pulsa Sugerir categoría, elige la más precisa y deja seleccionadas solo las fotos del artículo. La primera foto será la portada."),
        ("Datos del producto", "Completa marca, color, medida, unidades u otros datos que pida Mercado Libre. Escribe solamente información real."),
        ("Decide", "Pulsa Guardar borrador si quieres volver después o Publicar ahora cuando estés completamente segura."),
    ]
    for index, (title, body) in enumerate(steps, start=1):
        y = draw_numbered_step(pdf, index, title, body, y)
    draw_note(pdf, "Precio sugerido", "La utilidad objetivo ayuda a proponer un precio antes de publicar. Envíos, impuestos, descuentos o devoluciones pueden cambiar el dinero final que recibes.", y, SOFT_PINK, PINK)
    pdf.showPage()


def profiles_page(pdf: canvas.Canvas) -> None:
    y = draw_section_header(pdf, 4, "Paso 3", "Perfiles rápidos", "Una forma más ágil de preparar productos parecidos, sin perder el control.")
    y = draw_paragraph(pdf, "Un perfil rápido guarda ajustes frecuentes de una categoría local, por ejemplo Bolígrafos / Lapiceros. Es una propuesta para ahorrar tiempo; cada publicación se puede modificar antes de guardar.", 50, y, PAGE_WIDTH - 100, size=10.5, leading=15)
    y -= 18
    steps = [
        ("Haz una primera publicación bien revisada", "Elige categoría, completa los datos, ajusta reserva de seguridad y define utilidad objetivo si te sirve."),
        ("Guarda el perfil", "En Ficha del producto pulsa Crear perfil rápido. Puedes guardar el producto como borrador o publicarlo después."),
        ("Úsalo en el siguiente producto", "Cuando elijas otro producto de esa categoría local, verás Perfil rápido aplicado. Revisa fotos, color, tamaño, categoría y precio."),
        ("Mejóralo si hace falta", "Pulsa Actualizar perfil rápido. El cambio solo sirve para próximas propuestas; no modifica publicaciones activas."),
    ]
    for index, (title, body) in enumerate(steps, start=1):
        y = draw_numbered_step(pdf, index, title, body, y)
    draw_note(pdf, "Ejemplo", "Preparaste correctamente un lapicero y guardaste el perfil. El siguiente lapicero tendrá una base útil, pero debes confirmar que sus fotos y características sean las correctas.", y, SOFT_GREEN, GREEN)
    pdf.showPage()


def listings_page(pdf: canvas.Canvas) -> None:
    y = draw_section_header(pdf, 5, "Paso 4", "Manejar publicaciones", "Todo cambio importante pide tu confirmación.")
    cards = [
        ("Editar", "Cambia precio, reserva, fotos o datos de una publicación.", SOFT_BLUE),
        ("Sincronizar contenido", "Envía fotos, descripción y datos seleccionados. Reemplaza esos datos allá.", SOFT_PINK),
        ("Pausar o activar", "Detén temporalmente una publicación o vuelve a ofrecerla.", SOFT_YELLOW),
        ("Revisar calidad", "Mira sugerencias sobre título, fotos o datos. Tú decides si aplicarlas.", SOFT_GREEN),
    ]
    for index, (title, body, color) in enumerate(cards):
        column = index % 2
        row = index // 2
        draw_card(pdf, 50 + column * 250, y - row * 125, 235, 105, title, body, color)
    y -= 278
    y = draw_note(pdf, "Acciones masivas", "Marca como máximo 20 publicaciones y revisa que todas necesiten exactamente la misma acción. Nunca uses acciones masivas con productos que no hayas revisado.", y, SOFT_YELLOW, YELLOW)
    draw_note(pdf, "Publicaciones que ya existían", "Usa Importar existentes para ver publicaciones creadas antes de esta herramienta. Confirma el producto local correcto antes de vincular. Si tienes dudas, déjala pendiente.", y, SOFT_BLUE, BLUE)
    pdf.showPage()


def sales_page(pdf: canvas.Canvas) -> None:
    y = draw_section_header(pdf, 6, "Paso 5", "Cuando recibes una venta", "La venta pagada se registra una sola vez y el inventario se actualiza desde P de Papel.")
    steps = [
        ("Abre Ventas de Mercado Libre", "Revisa producto, cantidad y estado. Neto recibido es el dinero liquidado para P de Papel, no el precio total pagado por el cliente."),
        ("Prepara el pedido", "Empaca con el proceso habitual de Mercado Libre. Consulta Envíos y despachos para ver la guía y el estado de envío."),
        ("Responde preguntas", "En Centro de operaciones revisa la respuesta propuesta, edítala y envíala solo cuando sea correcta. Nadie responde automáticamente por ti."),
        ("Atiende reclamos con cuidado", "Abre el caso en Mercado Libre y sigue sus indicaciones. No sumes stock por una devolución hasta recibir y revisar físicamente el producto."),
    ]
    for index, (title, body) in enumerate(steps, start=1):
        y = draw_numbered_step(pdf, index, title, body, y)
    draw_note(pdf, "Evita duplicados", "No crees una venta manual en P de Papel si la venta ya aparece como pagada desde Mercado Libre. Así evitas duplicar ingresos o descontar existencias dos veces.", y, SOFT_PINK, PINK)
    pdf.showPage()


def reconciliation_page(pdf: canvas.Canvas) -> None:
    y = draw_section_header(pdf, 7, "Paso 6", "Ventas anteriores y ayuda", "Dos procesos seguros para momentos especiales.")
    y = draw_paragraph(pdf, "Si vendiste en Mercado Libre antes de conectar la herramienta, puedes registrar esa venta anterior una sola vez:", 50, y, PAGE_WIDTH - 100, size=10.5, leading=15)
    y -= 18
    steps = [
        ("Copia el número de venta", "En Mercado Libre abre la venta pagada y copia el número que aparece como Venta #..."),
        ("Revísala en P de Papel", "En Ventas de Mercado Libre busca la opción para revisar una venta anterior. Pega el número y confirma cada producto sugerido."),
        ("Comprueba el inventario", "Solo continúa si esa venta todavía no fue creada manualmente ni descontada con un ajuste anterior. Si ya la registraste, no la concilies."),
        ("Completa y confirma", "Copia cargos, envío e impuestos del resumen de Mercado Libre. Pulsa Conciliar venta pagada y confirma."),
    ]
    for index, (title, body) in enumerate(steps, start=1):
        y = draw_numbered_step(pdf, index, title, body, y)
    draw_note(pdf, "Si algo no se ve bien", "No repitas publicaciones o conciliaciones mientras se están procesando. Espera unos minutos y actualiza la pantalla. Si continúa, anota el producto o número de venta y avisa a la persona responsable.", y, SOFT_YELLOW, YELLOW)
    pdf.showPage()


def ads_page(pdf: canvas.Canvas) -> None:
    y = draw_section_header(pdf, 8, "Paso 7", "Product Ads sin sorpresas", "Decide sobre la publicidad con números reales, no con promesas de Mercado Libre.")
    y = draw_numbered_step(pdf, 1, "Consultar métricas no cuesta dinero", "En Ventas -> Mercado Libre -> Product Ads pulsa Consultar métricas. Solo actualiza la información de los últimos 30 días; no crea anuncios ni cambia campañas.", y)
    y = draw_numbered_step(pdf, 2, "No confundas ventas atribuidas con ganancia", "Gasto publicitario real muestra lo cobrado por publicidad. Ventas atribuidas, ROAS y ACOS son mediciones de Mercado Libre. No descuentan comisión, envío, impuestos, devoluciones ni costo del producto.", y)
    y = draw_numbered_step(pdf, 3, "Pausar detiene gasto nuevo", "Pausar evita nuevos cobros por clic después de que Mercado Libre confirme. No devuelve cobros anteriores y la publicación sigue disponible para ventas orgánicas.", y)
    y = draw_numbered_step(pdf, 4, "Activar puede volver a generar cobros", "Antes de activar revisa el presupuesto diario. Una campaña activa no garantiza ventas y puede volver a cobrar por clic.", y)
    draw_note(pdf, "Ajustar con cuidado", "El presupuesto es un promedio diario: como referencia, multiplícalo por 30 para estimar un mes, pero Mercado Libre puede cobrar hasta el doble en un día para compensar días anteriores. Un ROAS menor busca más alcance, pero puede dejar menos margen por venta. Un ROAS mayor busca cuidar el margen, pero puede disminuir clics y ventas.", y, SOFT_PINK, PINK)
    draw_note(pdf, "Tú mantienes el control", "Cada pausa, activación o ajuste pide confirmación y queda registrado. P de Papel nunca crea campañas, anuncios ni cambios automáticos de presupuesto.", 205, SOFT_GREEN, GREEN)
    pdf.showPage()


def final_checklist_page(pdf: canvas.Canvas) -> None:
    y = draw_section_header(pdf, 9, "Paso 8", "Lista final antes de decidir", "Una última mirada evita la mayoría de errores y gastos innecesarios.")
    checks = [
        "El producto local elegido es el correcto.",
        "El precio corresponde a Mercado Libre, no necesariamente al de la tienda.",
        "La reserva de seguridad protege las existencias reales.",
        "Las fotos, título y datos describen el producto real.",
        "Revisé los cargos y el Neto recibido en las ventas pagadas.",
        "Si uso Product Ads, entiendo que ventas atribuidas no son utilidad.",
        "Antes de activar una campaña revisé su presupuesto diario y el gasto de los últimos 30 días.",
        "Si algo parece extraño, no repito la acción: espero, actualizo y pido ayuda.",
    ]
    for check in checks:
        pdf.setStrokeColor(BLUE)
        pdf.roundRect(54, y - 10, 14, 14, 2, fill=0, stroke=1)
        y = draw_paragraph(pdf, check, 82, y, PAGE_WIDTH - 142, size=10.5, leading=15)
        y -= 9
    draw_note(pdf, "Recuerda", "P de Papel ayuda a ordenar tu operación. Las decisiones de publicación, inventario, precio y publicidad siempre las toma una persona del equipo.", y, SOFT_BLUE, BLUE)
    pdf.showPage()


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT_PATH), pagesize=A4)
    pdf.setTitle("Guía práctica de Mercado Libre - P de Papel")
    pdf.setAuthor("P de Papel")
    cover_page(pdf)
    before_using_page(pdf)
    publish_page(pdf)
    profiles_page(pdf)
    listings_page(pdf)
    sales_page(pdf)
    reconciliation_page(pdf)
    ads_page(pdf)
    final_checklist_page(pdf)
    pdf.save()
    print(f"Generated {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
