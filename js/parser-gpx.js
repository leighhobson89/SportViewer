import { createActivitySkeleton, finalizeActivity, normalizeSport } from './database.js';

function firstChildByLocalNames(parent, localNames) {
    if (!parent) {
        return null;
    }

    return Array.from(parent.childNodes || [])
        .find((child) => child.nodeType === 1 && localNames.includes(child.localName)) || null;
}

function textContentByLocalNames(parent, localNames) {
    const element = firstChildByLocalNames(parent, localNames);
    return element?.textContent?.trim() || null;
}

function descendantTextContentByLocalNames(parent, localNames) {
    if (!parent) {
        return null;
    }

    for (const localName of localNames) {
        const element = parent.getElementsByTagNameNS('*', localName)[0];
        if (element?.textContent?.trim()) {
            return element.textContent.trim();
        }
    }

    return null;
}

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function dateOrNull(value) {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function guessSportFromFilename(filename) {
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename.includes('run')) {
        return 'Run';
    }
    if (lowerFilename.includes('ride') || lowerFilename.includes('cycle') || lowerFilename.includes('bike')) {
        return 'Ride';
    }
    if (lowerFilename.includes('walk')) {
        return 'Walk';
    }
    if (lowerFilename.includes('hike')) {
        return 'Hike';
    }
    if (lowerFilename.includes('swim')) {
        return 'Swim';
    }

    return 'Unknown';
}

export async function parseGpxFile({ filename, text }) {
    const parser = new DOMParser();
    const xmlDocument = parser.parseFromString(text, 'application/xml');
    const parserError = xmlDocument.querySelector('parsererror');

    if (parserError) {
        throw new Error('Invalid GPX XML document');
    }

    const activity = createActivitySkeleton({
        filename,
        sourceFormat: 'gpx'
    });

    const gpxElement = xmlDocument.documentElement;
    const metadataElement = firstChildByLocalNames(gpxElement, ['metadata']);
    const trackElement = xmlDocument.getElementsByTagNameNS('*', 'trk')[0] || null;
    const routeElement = xmlDocument.getElementsByTagNameNS('*', 'rte')[0] || null;
    const baseElement = trackElement || routeElement || gpxElement;

    const declaredName = textContentByLocalNames(trackElement, ['name'])
        || textContentByLocalNames(routeElement, ['name'])
        || textContentByLocalNames(metadataElement, ['name']);

    const declaredSport = textContentByLocalNames(trackElement, ['type'])
        || textContentByLocalNames(metadataElement, ['type'])
        || descendantTextContentByLocalNames(baseElement, ['type']);

    activity.name = declaredName || filename.replace(/\.[^.]+$/, '');
    activity.sport = normalizeSport(declaredSport || guessSportFromFilename(filename));
    activity.startTime = dateOrNull(textContentByLocalNames(metadataElement, ['time']));

    const pointElements = [
        ...Array.from(xmlDocument.getElementsByTagNameNS('*', 'trkpt')),
        ...Array.from(xmlDocument.getElementsByTagNameNS('*', 'rtept'))
    ];

    if (!pointElements.length) {
        activity.issues.push('No GPS track points found');
        return finalizeActivity(activity);
    }

    activity.points = pointElements.map((pointElement) => {
        const extensionElement = firstChildByLocalNames(pointElement, ['extensions']);
        const hr = descendantTextContentByLocalNames(extensionElement, ['hr', 'heartrate']);
        const cadence = descendantTextContentByLocalNames(extensionElement, ['cad', 'cadence']);
        const power = descendantTextContentByLocalNames(extensionElement, ['power', 'watts']);
        const temperature = descendantTextContentByLocalNames(extensionElement, ['atemp', 'temp', 'temperature']);
        const speed = descendantTextContentByLocalNames(extensionElement, ['speed']);

        return {
            lat: numberOrNull(pointElement.getAttribute('lat')),
            lon: numberOrNull(pointElement.getAttribute('lon')),
            ele: numberOrNull(textContentByLocalNames(pointElement, ['ele'])),
            time: dateOrNull(textContentByLocalNames(pointElement, ['time'])),
            hr: numberOrNull(hr),
            cadence: numberOrNull(cadence),
            power: numberOrNull(power),
            temperature: numberOrNull(temperature),
            speedKmh: numberOrNull(speed) !== null ? numberOrNull(speed) * 3.6 : null
        };
    });

    activity.startTime = activity.startTime || activity.points.find((point) => point.time instanceof Date)?.time || null;
    return finalizeActivity(activity);
}
