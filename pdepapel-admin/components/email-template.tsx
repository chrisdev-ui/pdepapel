import { format } from 'date-fns'

/* eslint-disable @next/next/no-img-element */
interface EmailTemplateProps {
  name: string
  phone: string
  address: string
  orderNumber: string
  paymentMethod: string
}

export const EmailTemplate: React.FC<Readonly<EmailTemplateProps>> = ({
  name,
  phone,
  address,
  orderNumber,
  paymentMethod
}) => {
  return (
    <table
      width="100%"
      border={0}
      cellSpacing="0"
      cellPadding="0"
      bgcolor="#f9d6e4"
    >
      <tr>
        <td>&nbsp;</td>
        <td
          width="600"
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 0 10px rgba(0, 0, 0, 0.2)'
          }}
        >
          {/* Card Start */}
          <table width="100%" border={0} cellSpacing="0" cellPadding="0">
            <tr>
              <td align="center" style={{ padding: '20px' }}>
                {/* Image  */}
                <img
                  src="https://res.cloudinary.com/dsogxa0hj/image/upload/v1704428256/wpl8rjmseskt2rzehpfg.png"
                  alt="logo"
                  width="300"
                  height="300"
                  style={{
                    display: 'block',
                    width: '300px',
                    height: 'auto',
                    objectFit: 'contain'
                  }}
                />
              </td>
            </tr>
            <tr>
              <td
                style={{
                  textAlign: 'center',
                  fontFamily: 'Arial',
                  fontSize: '24px',
                  fontWeight: 'bold'
                }}
              >
                {/* Title  */}
                <table width="100%" border={0} cellSpacing="0" cellPadding="0">
                  <tr>
                    <td
                      style={{
                        padding: '0 10px'
                      }}
                    >
                      Correo electrónico de creación de órdenes
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td
                style={{
                  textAlign: 'left',
                  fontFamily: 'Arial',
                  fontSize: '18px',
                  fontWeight: '600',
                  padding: '0 20px',
                  marginTop: '30px'
                }}
              >
                {/* Description */}
                Hola Paula,
              </td>
            </tr>
            <tr>
              <td
                style={{
                  textAlign: 'left',
                  fontFamily: 'Arial',
                  fontSize: '14px',
                  padding: '20px',
                  color: '#666666'
                }}
              >
                {/* Content  */}
                <div>
                  ¡Buenas noticias! {name} ha creado una nueva orden de compra #
                  {orderNumber}.
                </div>
                <div>
                  <br />
                  <strong>Nombre:</strong> {name}
                  <br />
                  <strong>Fecha:</strong> {format(new Date(), 'dd/MM/yyyy')}
                  <br />
                  <strong>Teléfono:</strong> {phone}
                  <br />
                  <strong>Dirección:</strong> {address}
                  <br />
                  <strong>Método de pago:</strong> {paymentMethod}
                </div>
                <div>Saludos cordiales</div>
              </td>
            </tr>
            <tr>
              <td
                style={{
                  textAlign: 'center',
                  fontFamily: 'Arial',
                  fontSize: '14px',
                  padding: '20px'
                }}
              >
                {/* Footer  */}
                &copy; 2023 Papelería P de Papel Co. Todos los derechos
                reservados.
              </td>
            </tr>
          </table>
        </td>
        <td>&nbsp;</td>
      </tr>
    </table>
  )
}
