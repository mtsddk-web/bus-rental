// API endpoint: Pobiera zajęte terminy z ClickUp
// GET /api/availability

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN;
    const CLICKUP_LIST_ID = process.env.CLICKUP_LIST_ID || '901503815767';

    try {
        // Pobierz wszystkie taski z listy "Wynajem busa"
        const response = await fetch(
            `https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task?statuses[]=rezerwacje&statuses[]=w%20trakcie%20wynajmu&include_closed=false`,
            {
                headers: {
                    'Authorization': CLICKUP_API_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`ClickUp API error: ${response.status}`);
        }

        const data = await response.json();

        // Przekształć taski na zajęte daty
        const bookedDates = data.tasks
            .filter(task => task.start_date && task.due_date)
            .map(task => ({
                start: new Date(parseInt(task.start_date)).toISOString().split('T')[0],
                end: new Date(parseInt(task.due_date)).toISOString().split('T')[0],
                name: task.name
            }));

        return res.status(200).json({
            success: true,
            bookedDates
        });

    } catch (error) {
        console.error('Error fetching availability:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch availability',
            bookedDates: []
        });
    }
}
