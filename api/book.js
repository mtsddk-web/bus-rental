// API endpoint: Tworzy rezerwację w ClickUp
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
    const NOTIFICATION_PHONE = process.env.NOTIFICATION_PHONE || '518618058';

    try {
        const {
            type,
            typeLabel,
            price,
            date,
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
        const startDate = new Date(`${date}T${startTime || '09:00'}:00`);
        const endDate = new Date(`${date}T${endTime || '17:00'}:00`);

        // Dla wynajmów wielodniowych - dodaj dni
        const daysMap = {
            '4h': 0,
            '1-2d': 1,
            '3-4d': 3,
            '5-10d': 5,
            '11-30d': 11,
            'weekend': 2
        };

        if (daysMap[type] > 0) {
            endDate.setDate(endDate.getDate() + daysMap[type]);
        }

        // Formatuj opis
        const description = `REZERWACJA ONLINE

Klient: ${clientName}
Telefon: ${clientPhone}
Email: ${clientEmail || 'brak'}

Typ wynajmu: ${typeLabel}
Cena: ${price} zł
Kaucja: 600 zł

Data odbioru: ${formatDatePL(startDate)} o ${startTime || '09:00'}
Data zwrotu: ${formatDatePL(endDate)} o ${endTime || '17:00'}

---
Rezerwacja utworzona automatycznie przez stronę rezerwacji.
Wymaga potwierdzenia telefonicznego.`;

        // Utwórz task w ClickUp
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
                    start_date: startDate.getTime(),
                    due_date: endDate.getTime(),
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

        // Opcjonalnie: wyślij powiadomienie przez n8n webhook
        // (możesz później dodać integrację z SMS)
        try {
            await sendNotification({
                clientName,
                clientPhone,
                typeLabel,
                price,
                date: formatDatePL(startDate),
                startTime,
                taskUrl: taskData.url
            });
        } catch (notifyError) {
            console.error('Notification error:', notifyError);
            // Nie blokuj rezerwacji jeśli powiadomienie nie zadziała
        }

        return res.status(200).json({
            success: true,
            taskId: taskData.id,
            taskUrl: taskData.url,
            message: 'Rezerwacja została utworzona'
        });

    } catch (error) {
        console.error('Booking error:', error);
        return res.status(500).json({
            success: false,
            error: 'Nie udało się utworzyć rezerwacji. Spróbuj ponownie lub zadzwoń.'
        });
    }
}

function formatDatePL(date) {
    return date.toLocaleDateString('pl-PL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

async function sendNotification(data) {
    // Webhook do n8n - możesz później skonfigurować
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
