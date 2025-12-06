// API endpoint: Tworzy rezerwacje w ClickUp + wysyla emaile
// POST /api/book

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN;
    const CLICKUP_LIST_ID = process.env.CLICKUP_LIST_ID || '901503815767';

    try {
        const {
            type,
            typeLabel,
            price,
            pricePerDay,
            days,
            date,
            endDate,
            startTime,
            endTime,
            clientName,
            clientPhone,
            clientEmail
        } = req.body;

        // Walidacja
        if (!type || !date || !clientName || !clientPhone) {
            return res.status(400).json({
                success: false,
                error: 'Brakuje wymaganych danych'
            });
        }

        // Przygotuj daty
        const startDateTime = new Date(`${date}T${startTime || '09:00'}:00`);
        const endDateTime = new Date(`${endDate || date}T${endTime || '17:00'}:00`);

        // Formatuj opis
        let dateInfo = formatDatePL(startDateTime);
        if (date !== endDate && endDate) {
            dateInfo = `${formatDatePL(startDateTime)} - ${formatDatePL(endDateTime)}`;
        }

        const description = `REZERWACJA ONLINE

Klient: ${clientName}
Telefon: ${clientPhone}
Email: ${clientEmail || 'brak'}

Typ wynajmu: ${typeLabel}
${days > 1 ? `Liczba dni: ${days}\nCena za dobe: ${pricePerDay} zl\n` : ''}Cena calkowita: ${price} zl
Kaucja: 600 zl

Termin: ${dateInfo}
Godziny: ${startTime || '09:00'} - ${endTime || '17:00'}

---
Rezerwacja utworzona automatycznie przez strone rezerwacji.`;

        // Utworz task w ClickUp
        const taskResponse = await fetch(
            `https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`,
            {
                method: 'POST',
                headers: {
                    'Authorization': CLICKUP_API_TOKEN,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: `${clientPhone} - ${clientName}`,
                    description: description,
                    status: 'rezerwacje',
                    start_date: startDateTime.getTime(),
                    due_date: endDateTime.getTime(),
                    notify_all: true
                })
            }
        );

        if (!taskResponse.ok) {
            const errorData = await taskResponse.text();
            console.error('ClickUp error:', errorData);
            throw new Error(`ClickUp API error: ${taskResponse.status}`);
        }

        const taskData = await taskResponse.json();

        // Wyslij emaile przez SMTP
        const emailData = {
            clientName,
            clientPhone,
            clientEmail,
            typeLabel,
            price,
            pricePerDay,
            days,
            dateInfo,
            startTime,
            endTime,
            taskUrl: taskData.url
        };

        try {
            await sendEmails(emailData);
        } catch (emailError) {
            console.error('Email error:', emailError);
            // Nie blokuj - rezerwacja i tak jest w ClickUp
        }

        return res.status(200).json({
            success: true,
            taskId: taskData.id,
            taskUrl: taskData.url,
            message: 'Rezerwacja zostala utworzona'
        });

    } catch (error) {
        console.error('Booking error:', error);
        return res.status(500).json({
            success: false,
            error: 'Nie udalo sie utworzyc rezerwacji. Sprobuj ponownie lub zadzwon.'
        });
    }
}

function formatDatePL(date) {
    return date.toLocaleDateString('pl-PL', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

async function sendEmails(data) {
    const SMTP_HOST = process.env.SMTP_HOST || 'smtp.zenbox.pl';
    const SMTP_PORT = process.env.SMTP_PORT || '587';
    const SMTP_USER = process.env.SMTP_USER || 'biuro@sundek-energia.pl';
    const SMTP_PASS = process.env.SMTP_PASS;
    const OWNER_EMAIL = process.env.OWNER_EMAIL || 'mts.ddk@gmail.com';

    if (!SMTP_PASS) {
        console.log('No SMTP password configured, skipping emails');
        return;
    }

    const {
        clientName,
        clientPhone,
        clientEmail,
        typeLabel,
        price,
        days,
        dateInfo,
        startTime,
        endTime,
        taskUrl
    } = data;

    // Użyj nodemailer przez dynamic import (Vercel obsługuje)
    const nodemailer = await import('nodemailer');

    const transporter = nodemailer.default.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT),
        secure: false, // TLS
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });

    // 1. Email do wlasciciela (Ciebie)
    await transporter.sendMail({
        from: `"Rezerwacje Bus" <${SMTP_USER}>`,
        to: OWNER_EMAIL,
        subject: `🚐 Nowa rezerwacja: ${clientName} - ${dateInfo}`,
        html: `
            <h2>Nowa rezerwacja busa!</h2>
            <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Klient:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${clientName}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Telefon:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;"><a href="tel:${clientPhone}">${clientPhone}</a></td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${clientEmail || 'brak'}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Termin:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${dateInfo}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Godziny:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${startTime} - ${endTime}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Typ:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${typeLabel}${days > 1 ? ` (${days} dni)` : ''}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Cena:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${price} zl</strong> + 600 zl kaucja</td></tr>
            </table>
            <p style="margin-top: 20px;">
                <a href="${taskUrl}" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Zobacz w ClickUp</a>
            </p>
        `
    });

    // 2. Email do klienta (jesli podal email)
    if (clientEmail) {
        await transporter.sendMail({
            from: `"Wynajem Busa - Mateusz Dudek" <${SMTP_USER}>`,
            to: clientEmail,
            subject: `Potwierdzenie rezerwacji busa - ${dateInfo}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2563eb;">Dziekujemy za rezerwacje!</h2>
                    <p>Czesc ${clientName.split(' ')[0]},</p>
                    <p>Twoja rezerwacja busa Renault Master zostala przyjeta.</p>

                    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
                        <h3 style="margin-top: 0; color: #0f172a;">Szczegoly rezerwacji:</h3>
                        <p><strong>Termin:</strong> ${dateInfo}</p>
                        <p><strong>Godziny:</strong> ${startTime} - ${endTime}</p>
                        <p><strong>Typ wynajmu:</strong> ${typeLabel}</p>
                        <p><strong>Cena:</strong> ${price} zl</p>
                        <p><strong>Kaucja zwrotna:</strong> 600 zl</p>
                    </div>

                    <div style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0;">
                        <strong>Co dalej?</strong>
                        <ul style="margin: 10px 0; padding-left: 20px;">
                            <li>Odbior busa: Tychy lub Mikolow (zadzwon dzien wczesniej)</li>
                            <li>Przy odbiorze: dowod osobisty + prawo jazdy kat. B</li>
                            <li>Platnosc: gotowka, BLIK lub przelew</li>
                            <li>Limit: 200 km/dobe (powyzej +0,40 zl/km)</li>
                        </ul>
                    </div>

                    <p>W razie pytan dzwon: <a href="tel:+48518618058">518 618 058</a></p>

                    <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                        Pozdrawiam,<br>
                        Mateusz Dudek<br>
                        Wynajem Busa Renault Master
                    </p>
                </div>
            `
        });
    }
}
