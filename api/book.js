// API endpoint: Tworzy rezerwacje w ClickUp
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
Rezerwacja utworzona automatycznie przez strone rezerwacji.
Wymaga potwierdzenia telefonicznego.`;

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

        // Opcjonalnie: wyslij powiadomienie przez n8n webhook
        try {
            await sendNotification({
                clientName,
                clientPhone,
                typeLabel,
                price,
                days,
                date: dateInfo,
                startTime,
                taskUrl: taskData.url
            });
        } catch (notifyError) {
            console.error('Notification error:', notifyError);
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

async function sendNotification(data) {
    const N8N_WEBHOOK = process.env.N8N_WEBHOOK_URL;

    if (!N8N_WEBHOOK) {
        console.log('No N8N webhook configured, skipping notification');
        return;
    }

    await fetch(N8N_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'new_bus_booking',
            ...data
        })
    });
}
