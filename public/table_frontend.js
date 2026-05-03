async function showDailyEnergyEntries() {

    const tableBody = document.getElementById('tableBody');
    const statsBar = document.getElementById('statsBar');


    try {
        const response = await fetch('/api/calculations');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const calculations = data.calculations || [];


        if (!calculations || calculations.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="empty">Keine Berechnungen gefunden</td></tr>';
            statsBar.innerHTML = '';
            return;
        }

        // Filter for daily calculations only
        const dailyCalculations = calculations.filter(calc =>
            calc.input?.trueCalcType === 'daily'
        );


        console.log(`filter list daily: ${dailyCalculations.length}`)
        console.log(...dailyCalculations)
        console.log("......................................")


        const momentCalculations = calculations.filter(calc =>
            calc.input?.trueCalcType === 'moment'
        )

        console.log(`filter list moment: ${momentCalculations.length}`)
        console.log(...momentCalculations)
        console.log("......................................")

        if (dailyCalculations.length === 0 && momentCalculations.length === 0) {
            console.log('No daily calculations found');
            return;
        }

        // Loop through every daily calculation and show energy
        console.log(`Found ${dailyCalculations.length} daily calculation(s):\n`);

        let groupId = 0;
        let dailyGroup = new Map();

        dailyCalculations.forEach((calc, index) => {
            if (index === 0) {
                groupId = calc.id
            }

            if (calc.input?.hour !== undefined) {
                const check = calc.id - calc.input?.hour
                if (groupId > check) {
                    groupId = calc.id - calc.input?.hour
                }
            } else {
                const check = calc.id - calc.input?.dayOfYear
                if (groupId > check) {
                    groupId = calc.id - calc.input?.dayOfYear
                }
            }


            const power = calc.result?.power !== undefined ? calc.result.power : calc.result.energyWh;
            const hour = calc.input?.hour;
            const specificHour = calc.input?.specificHour;
            const date = new Date(calc.createdAt);
            const formattedDate = date.toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            if (!dailyGroup.has(groupId)) {
                dailyGroup.set(groupId, {
                    id: calc.id,
                    power: [],
                    days: 0,
                    input: {...calc.input}
                })
            }

            const group = dailyGroup.get(groupId);
            group.power.push(power);
            group.days += 1

        });

        const momentGroup = new Map()
        let counter = 0

        momentCalculations.forEach((calc, index) => {
            if (counter >= 0) {
                const power = calc.result?.power;
                const hour = calc.input?.hour;
                const specificHour = calc.input?.specificHour;
                const date = new Date(calc.createdAt);
                const formattedDate = date.toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                console.log(`${hour} === ${specificHour}`)
                if (hour === specificHour) {
                    if (!momentGroup.has(calc.id)) {
                        momentGroup.set(calc.id, {
                            id: calc.id,
                            power: [],
                            input: {...calc.input}
                        })
                    }

                    const group = momentGroup.get(calc.id);
                    group.power.push(power);
                }
            } else {
                counter -= 1
            }
        })

        const displayCalculationsDaily = Array.from(dailyGroup.values());
        const displayCalculationsMoment = Array.from(momentGroup.values());

        const displayCalculations = [...displayCalculationsDaily, ...displayCalculationsMoment];
        console.log(displayCalculations)

        displayCalculations.sort((a, b) => b.id - a.id);

        tableBody.innerHTML = '';

        displayCalculations.forEach((group, index) => {

            const row = tableBody.insertRow();

            let actualIndex = displayCalculations.length-index;

            let power = group.power
            let calcType = group.input?.trueCalcType
            let type = group.input?.type

            // Calculate average power (fixing the "hello" placeholder)
            let avgPower = (power.reduce((sum, item) => sum + item, 0) / power.length).toFixed(2);

            // Format inputs as readable string
            let inputs = [];
            if (group.input?.hour !== undefined) {
                inputs.push(`Stunden: ${group.input.hour + 1}`)
            } else if (group.input?.dayOfYear !== undefined){
                inputs.push(`Tage: ${group.days}`)
            }
            if (group.input?.specificHour !== undefined) {
                inputs.push(`Spez. Stunde: ${group.input.specificHour}`)
            } else {
                inputs.push(`Spez. Stunde: undefined`)
            }
            if (group.input?.panelArea) {
                inputs.push(`Fläche: ${group.input.panelArea}`)
            } else {
                inputs.push(`Fläche: undefined`)
            }
            if (group.input?.panelTilt) {
                inputs.push(`Neigung: ${group.input.panelTilt}°`)
            } else {
                inputs.push(`Neigung: undefined`)
            }
            if (group.input?.panelAzimuth) {
                inputs.push(`Azimut: ${group.input.panelAzimuth}°`)
            } else {
                inputs.push(`Azimut: undefined`)
            }

            const inputsTextDaily = `<Section style="grid-column: 2 / 2">
                                                            <span>${inputs[0]}; </span>
                                                            <span>${inputs[2]}; </span>
                                                            <span>${inputs[3]}; </span>
                                                            <span>${inputs[4]}</span>
                                                        </Section>` || '-';

            const inputsTextMoment = `<Section style="grid-column: 2 / 2">
                                                            <span>${inputs[1]}; </span> 
                                                            <span>${inputs[2]}; </span>
                                                            <span>${inputs[3]}; </span>
                                                            <span>${inputs[4]}</span>
                                                        </Section>` || '-';

            let inputsText = '-'
            if (calcType === 'daily') {
                inputsText = inputsTextDaily;
            } else if (calcType === 'moment') {
                inputsText = inputsTextMoment
            }

            row.insertCell(0).textContent = (actualIndex).toString();
            row.insertCell(1).textContent = calcType === 'daily' ? 'Tagesertrag' : (calcType === 'moment' ? 'Momentanleistung' : calcType);
            row.insertCell(2).innerHTML = `<span class="badge">${type || 'Standard'}</span>`;
            row.insertCell(3).textContent = `${(power.reduce((sum, item) => sum + item, 0)).toFixed(2)} Wh`;
            row.insertCell(4).textContent = `${avgPower} W${group.input?.hour !== undefined ? '/h' : '/t'}`;
            row.insertCell(5).innerHTML = `<span>${inputsText}</span>` ;

        })


    } catch (error) {
        console.error('Error loading daily energy entries:', error);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    showDailyEnergyEntries();

    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', async function() {
            await deleteUserAccount();
        });
    }
});

async function deleteUserAccount() {
    const userConfirmed = confirm(
        'ACHTUNG: Möchten Sie Ihr Konto wirklich löschen?\n\n' +
        'Diese Aktion ist ENDGÜLTIG und kann nicht rückgängig gemacht werden.\n' +
        'Alle Ihre Daten und Berechnungen werden unwiderruflich gelöscht.\n\n' +
        'Klicken Sie "OK" um fortzufahren oder "Abbrechen".'
    );

    if (!userConfirmed) return;

    const deleteBtn = document.getElementById('deleteAccountBtn');
    const originalText = deleteBtn.innerHTML;
    deleteBtn.innerHTML = 'Lösche Konto...';
    deleteBtn.disabled = true;

    try {
        const response = await fetch('/api/users/me', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (response.ok) {
            alert('Ihr Konto wurde erfolgreich gelöscht.');
            window.location.href = '/';
        } else if (response.status === 401) {
            alert('Sie sind nicht angemeldet.');
        } else {
            alert(`Fehler: ${response.statusText}`);
        }
    } catch (error) {
        alert(`Netzwerkfehler: ${error.message}`);
    } finally {
        deleteBtn.innerHTML = originalText;
        deleteBtn.disabled = false;
    }
}

// Make loadHistory function globally available
window.loadHistory = showDailyEnergyEntries;