const liveChartSettings = {
    totalWidth: 2070,
    totalHeight: 555,

    marginForLabels: 35,
    marginForSecTicks: 40,
    marginFormVLabel: 35
};

const gridSettings = {
    smallSqSize: 8,
    smallSqPermV: 10,
    smallSqPerSec: 25,
    inputValuesPermV: 200
};

const lineSettings = {
    signalLineWidth: 2.5,
    thinLineWidth: 1,
    thickLineWidth: 2
};


window.ecgChart = (function () {
    const charts = {};

    async function loadFile(baseUri, fileIndex) {
        if (!baseUri) {
            console.error("Base URI undefined in loadFile.");
            return;
        }

        let url = `${baseUri}EcgData/${100 + fileIndex}.ecg`;
        console.log(`Fetching file from: ${url}`);
        const response = await fetch(url);
        const data = await response.text();
        return data.split('\n').map(line => parseInt(line.trim())).filter(Number.isFinite);
    }

    function cleanupChart(containerId) {
        const chart = charts[containerId];
        if (chart) {
            stopStreaming(chart);
            if (chart.connection) {
                chart.connection.stop().catch(err =>
                    console.error("Failed to stop SignalR connection in cleanupChart:", err)
                );
            }
            delete charts[containerId];
        }
    }

    function renderChart(containerId, data, maxDisplayedValues) {
        setupScales(maxDisplayedValues);
        renderEcgLiveBaseline(containerId, maxDisplayedValues);

        const svg = d3.select(`#${containerId}`);
        let path = svg.select(".ecg-line");
        if (path.empty()) {
            path = svg.append("path")
                .attr("class", "ecg-line")
                .attr("fill", "none")
                .attr("stroke", "red")
                .attr("stroke-width", 1)
                .attr("d", "");
        }
        if (!charts[containerId]) {
            charts[containerId] = {
                data,
                index: 0,
                interval: null,
                maxDisplayedValues,
                connection: null,
            };
        } else {
            charts[containerId].data = data;
            charts[containerId].index = 0;
            charts[containerId].maxDisplayedValues = maxDisplayedValues;
        }
    }

    function startStreaming(chart) {
        if (!chart.connection) {
            console.error("No connection in startStreaming");
            return;
        }
        if (chart.connection.state !== "Connected") {
            console.error(`Connection state not ready in startStreaming. Current state: ${chart.connection.state}`);
            return;
        }
        if (chart.interval) {
            console.warn("Existing interval cleared in startStreaming");
            clearInterval(chart.interval);
        }

        chart.interval = setInterval(() => {
            const value = chart.data[chart.index];
            chart.index = (chart.index + 1) % chart.data.length;

            renderEcgSignalLive(chart.groupName, value, chart.maxDisplayedValues);

            chart.connection.invoke("SendEcgData", chart.groupName, value)
                .catch(err => console.error("Failed to send ECG data in startStreaming:", err));
        }, 8);
    }

    function stopStreaming(chart) {
        if (chart.interval) {
            clearInterval(chart.interval);
            chart.interval = null;
        }
    }

    async function updateFile(containerId, fileIndex) {
        const chart = charts[containerId];

        if (!chart) {
            console.error("chart undefined in updateFile");
            return;
        }
        if (!chart.baseUri) {
            console.error("baseUri undefined in updateFile");
            return;
        }
        console.log("baseUri updated in updateFile:", chart.baseUri);

        stopStreaming(chart);

        chart.data = await loadFile(chart.baseUri, fileIndex);
        chart.index = 0;

        clearEcgChart(chart.groupName);
        renderEcgLiveBaseline(containerId, chart.maxDisplayedValues);

        if (chart.connection) {
            try {
                chart.connection.off("ReceiveEcgData");
                await chart.connection.stop();
                console.log("SignalR connection stopped in updateFile");
            } catch (err) {
                console.error("Failed to stop SignalR connection in updateFile:", err);
            }
        }

        const newConnection = new signalR.HubConnectionBuilder()
            .withUrl(`${chart.baseUri}ecgHub`)
            .build();

        newConnection.on("ReceiveEcgData", value => {
            console.log(`Received data: ${value}`);
            renderEcgSignalLive(containerId, value, chart.maxDisplayedValues);
        });

        try {
            await newConnection.start();
            console.log("SignalR connection started in updateFile");

            await newConnection.invoke("AddToGroup", containerId);

            chart.connection = newConnection;
            console.log("Chart updated in updateFile:", chart);
        } catch (err) {
            console.error("Failed to start SignalR connection in updateFile:", err);
        }
    }

    return {
        init: async function (containerId, baseUri, fileIndex) {
            if (!baseUri) {
                console.error("Base URI undefined in init");
                return;
            }

            const data = await loadFile(baseUri, fileIndex);

            const connection = new signalR.HubConnectionBuilder()
                .withUrl("/ecgHub")
                .build();

            connection.on("ReceiveEcgData", value => {
                console.log(`Received data: ${value}`);
                renderEcgSignalLive(containerId, value, charts[containerId].maxDisplayedValues);
            });

            await connection.start();
            await connection.invoke("AddToGroup", containerId);

            renderChart(containerId, data, 2550);

            charts[containerId] = {
                connection,
                groupName: containerId,
                data,
                index: 0,
                interval: null,
                maxDisplayedValues: 2550,
                baseUri
            };
            currentIndex = 0;
            pathPoints = [];
        },
        startStreaming: function (containerId) {
            const chart = charts[containerId];
            if (chart) startStreaming(chart);
        },
        stopStreaming: function (containerId) {
            const chart = charts[containerId];
            if (chart) stopStreaming(chart);
        },
        updateFile: async function (containerId, fileIndex) {
            await updateFile(containerId, fileIndex);
        }, 
        cleanupChart: function (containerId) {
            cleanupChart(containerId);
        }, 
    };
})();


function clearEcgChart(chartId) {
    const svg = d3.select(`#${chartId}`);

    svg.selectAll('.ecg-line').remove();
    svg.selectAll('.current-line-circle').remove();
    svg.selectAll('.current-line').remove();

    svg.classed("live-ecg-svg", true);

    currentIndex = 0;
    pathPoints = [];
}


function clearAllSvg() {
    const svgs = document.querySelectorAll('svg');
    svgs.forEach(svg => svg.innerHTML = '');
}


let xScaleLive, yScaleLive;
function setupScales(maxDisplayedValues) {
    xScaleLive = d3.scaleLinear()
        .domain([0, maxDisplayedValues - 1])
        .range([
            liveChartSettings.marginForLabels,
            liveChartSettings.totalWidth - liveChartSettings.marginForLabels
        ]);

    yScaleLive = d3.scaleLinear()
        .domain([0, 1023])
        .range([
            liveChartSettings.totalHeight - liveChartSettings.marginForSecTicks - 35,
            liveChartSettings.marginFormVLabel + 35
        ]);
}


let currentIndex = 0;
let pathPoints = [];
function renderEcgSignalLive(chartId, newValue, maxDisplayedValues) {
    const svg = d3.select(`#${chartId}`);
    svg.classed("live-ecg-svg", true);

    // Signal
    let path = svg.select(".ecg-line");
    if (path.empty()) {
        path = svg.append("path")
            .attr("class", "ecg-line")
            .attr("fill", "none")
            .attr("stroke", "red")
            .attr("stroke-width", lineSettings.signalLineWidth)
            .attr("d", "");
    }

    if (pathPoints.length === 0) {
        const initialY = yScaleLive(512);
        for (let i = 0; i < maxDisplayedValues; i++) {
            const x = xScaleLive(i);
            pathPoints.push([x, initialY]);
        }
    }

    // New coordinate
    const x = xScaleLive(currentIndex);
    const y = yScaleLive(newValue);

    pathPoints.push([x, y]);

    // Wrap to start
    if (pathPoints.length > maxDisplayedValues) {
        pathPoints.shift();
    }

    // Gap after current index
    const gapStart = currentIndex + 1;
    const gapEnd = currentIndex + 20;

    const pathData = pathPoints.map((point, i) => {
        const pointIndex = (currentIndex - pathPoints.length + i + 1 + maxDisplayedValues) % maxDisplayedValues;

        if (pointIndex >= gapStart && pointIndex < gapEnd) {
            return `M${point[0]},${point[1]}`;
        } else if (i === 0 || (i > 0 && pathPoints[i - 1][0] > point[0])) {
            return `M${point[0]},${point[1]}`;
        } else {
            return `L${point[0]},${point[1]}`;
        }
    }).join(" ");

    path.attr("d", pathData);

    currentIndex++;
    if (currentIndex >= maxDisplayedValues) {
        currentIndex = 0;
    }

    // Current value circle
    svg.selectAll("circle").data([x]).join("circle")
        .attr("class", "current-line-circle")
        .attr("r", 5)
        .attr("cx", x)
        .attr("cy", liveChartSettings.totalHeight - liveChartSettings.marginForSecTicks - 10);

    // Current value line
    svg.selectAll("line.current-line").data([x]).join("line")
        .attr("class", "current-line")
        .attr("stroke-width", 2.5)
        .attr("x1", x)
        .attr("y1", liveChartSettings.marginFormVLabel)
        .attr("x2", x)
        .attr("y2", liveChartSettings.totalHeight - liveChartSettings.marginForSecTicks);
}


function renderEcgLiveBaseline(chartId, maxDisplayedValues) {
    const svg = d3.select(`#${chartId}`);
    svg.classed("live-ecg-svg", true);

    // Basline signal
    let path = svg.select(".ecg-line");
    if (path.empty()) {
        const flatLineY = yScaleLive(512);
        const flatLineData = d3.range(maxDisplayedValues).map(i => {
            const x = xScaleLive(i);
            return `${i === 0 ? 'M' : 'L'}${x},${flatLineY}`;
        }).join(" ");

        path = svg.append("path")
            .attr("class", "ecg-line")
            .attr("fill", "none")
            .attr("stroke", "red")
            .attr("stroke-width", lineSettings.signalLineWidth)
            .attr("d", flatLineData);
    }
}


function drawGridLive(chartId) {
    const svg = d3.select(`#${chartId}`);

    const svgHeight = 480;
    const svgWidth = 2000;
    const totalSvgHeight = svgHeight + liveChartSettings.marginForSecTicks + liveChartSettings.marginFormVLabel;
    const totalSvgWidth = svgWidth + liveChartSettings.marginForLabels * 2;

    const fontSize = 17;


    // Scale
    const yScale = d3.scaleLinear()
        .domain([0, 1023])
        .range([svgHeight, 0]);


    // Background
    const bgGroup = svg.append('g').attr('class', 'bg');
    bgGroup.append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', totalSvgWidth)
        .attr('height', totalSvgHeight);


    // Grid content
    const gridContentGroup = svg.append('g')
        .attr('class', 'grid-content')
        .attr('transform',
            `translate(${liveChartSettings.marginForLabels}, ${liveChartSettings.marginFormVLabel})`);


    // Labels
    const labelsGroup = svg.append('g').attr('class', 'labels');
    const labelsLineWidth = 1.7;
    const labelsLineLength = 10;

    // y axis line
    labelsGroup.append('line')
        .attr('x1', liveChartSettings.marginForLabels)
        .attr('y1', liveChartSettings.marginFormVLabel - labelsLineLength)
        .attr('x2', liveChartSettings.marginForLabels)
        .attr('y2', svgHeight + liveChartSettings.marginFormVLabel + labelsLineLength)
        .attr('stroke-width', labelsLineWidth);

    // x axis line
    labelsGroup.append('line')
        .attr('x1', liveChartSettings.marginForLabels - labelsLineLength)
        .attr('y1', svgHeight + liveChartSettings.marginFormVLabel)
        .attr('x2', totalSvgWidth - liveChartSettings.marginForLabels + labelsLineLength)
        .attr('y2', svgHeight + liveChartSettings.marginFormVLabel)
        .attr('stroke-width', labelsLineWidth);

    // mV label
    labelsGroup.append('text')
        .attr('x', 10)
        .attr('y', liveChartSettings.marginForLabels - 2)
        .attr('text-anchor', 'start')
        .attr('font-size', fontSize)
        .text(`mV`);

    // top line
    labelsGroup.append('line')
        .attr('x1', liveChartSettings.marginForLabels)
        .attr('y1', liveChartSettings.marginFormVLabel)
        .attr('x2', totalSvgWidth - liveChartSettings.marginForLabels)
        .attr('y2', liveChartSettings.marginFormVLabel)
        .attr('stroke-width', 1);


    // Grids
    const gridGroup = gridContentGroup.append('g').attr('class', 'grid-lines');

    // Vertical grid lines
    const verticalGridGroup = gridGroup.append('g').attr('class', 'vert-grid-lines');
    let counter = 0;
    let secValue = 0;
    for (let x = 0; x <= svgWidth; x += gridSettings.smallSqSize) {

        const isSec = (counter % 25 === 0);
        const isThick = isSec || (counter % 5 === 0);

        verticalGridGroup.append('line')
            .attr('x1', x).attr('y1', 0)
            .attr('x2', x).attr('y2', svgHeight)
            .attr('class', isSec ? 'grid-thick-line' : 'grid-line')
            .attr('stroke-width', isThick ? lineSettings.thickLineWidth : lineSettings.thinLineWidth);

        if (isSec) {
            // sec tick
            labelsGroup.append('line')
                .attr('x1', x + liveChartSettings.marginForLabels)
                .attr('y1', totalSvgHeight - liveChartSettings.marginForSecTicks)
                .attr('x2', x + liveChartSettings.marginForLabels)
                .attr('y2', totalSvgHeight - liveChartSettings.marginForSecTicks + labelsLineLength)
                .attr('stroke-width', labelsLineWidth);

            // sec label
            labelsGroup.append('text')
                .attr('x', x + liveChartSettings.marginForLabels - 4)
                .attr('y', totalSvgHeight - liveChartSettings.marginForSecTicks + labelsLineLength + 18)
                .attr('text-anchor', 'start')
                .attr('font-size', fontSize)
                .text(`${secValue}`);
            secValue++;
        }
        counter++;
    }

    // Horizontal grid lines
    const horizontalGridGroup = gridGroup.append('g').attr('class', 'hor-grid-lines');
    const baselineValue = 512;
    baselineY = yScale(baselineValue);

    const mVLabelMargin = liveChartSettings.marginFormVLabel + 5;

    // Horizontal grid lines above baseline
    counter = 0;
    let mVValue = 1;
    const horizontalGridAboveBaseline = horizontalGridGroup.append('g').attr('class', 'hor-grid-above-baseline');
    for (let y = baselineY; y >= 0; y -= gridSettings.smallSqSize) {
        const isThick = counter % 5 === 0;
        const isMv = (counter % 10 === 0) && (y != baselineY);
        horizontalGridAboveBaseline.append('line')
            .attr('x1', 0).attr('y1', y)
            .attr('x2', svgWidth).attr('y2', y)
            .attr('class', isMv ? 'grid-thick-line' : 'grid-line')
            .attr('stroke-width', isThick ? lineSettings.thickLineWidth : lineSettings.thinLineWidth);

        if (isMv) {
            // mV tick
            labelsGroup.append('line')
                .attr('x1', liveChartSettings.marginForLabels - labelsLineLength)
                .attr('y1', y + liveChartSettings.marginFormVLabel)
                .attr('x2', liveChartSettings.marginForLabels)
                .attr('y2', y + liveChartSettings.marginFormVLabel)
                .attr('stroke-width', labelsLineWidth);

            // mV label
            labelsGroup.append('text')
                .attr('x', 13)
                .attr('y', y + mVLabelMargin)
                .attr('text-anchor', 'start')
                .attr('font-size', fontSize)
                .text(`${mVValue}`);
            mVValue++;
        }
        counter++;
    }

    // Horizontal grid lines below baseline
    counter = 0;
    mVValue = 0;
    const horizontalGridBelowBaseline = horizontalGridGroup.append('g').attr('class', 'hor-grid-below-baseline');
    for (let y = baselineY; y <= svgHeight; y += gridSettings.smallSqSize) {
        const isThick = counter % 5 === 0;
        const isMv = (counter % 10 === 0);
        horizontalGridBelowBaseline.append('line')
            .attr('x1', 0).attr('y1', y)
            .attr('x2', svgWidth).attr('y2', y)
            .attr('class', isMv ? 'grid-thick-line' : 'grid-line')
            .attr('stroke-width', isThick ? lineSettings.thickLineWidth : lineSettings.thinLineWidth);

        if (isMv) {
            labelsGroup.append('line')
                .attr('x1', liveChartSettings.marginForLabels - labelsLineLength)
                .attr('y1', y + liveChartSettings.marginFormVLabel)
                .attr('x2', liveChartSettings.marginForLabels)
                .attr('y2', y + liveChartSettings.marginFormVLabel)
                .attr('stroke-width', labelsLineWidth);

            labelsGroup.append('text')
                .attr('x', mVValue < 0 ? 10 : 13)
                .attr('y', y + mVLabelMargin)
                .attr('text-anchor', 'start')
                .attr('font-size', fontSize)
                .text(`${mVValue}`);
            mVValue -= 1;
        }
        counter++;
    }
}

function renderECGSignalStatic(chartId, secRange, isMiddleSegment,
    segmentStartTime, data, maxDisplayedValues, minValue, maxValue, baselineValue) {

    const svg = d3.select(`#${chartId}`);
    
    const sqToExtendHeightBelowSignal = 2.5;
    const sqToExtendHeightAboveSignal = 7;

    const mVRange = (maxValue - minValue) / gridSettings.inputValuesPermV;
    const totalSqVertical = mVRange * gridSettings.smallSqPermV + sqToExtendHeightBelowSignal + sqToExtendHeightAboveSignal;
    const totalSqHoriz = secRange * gridSettings.smallSqPerSec;

    const svgWidth = totalSqHoriz * gridSettings.smallSqSize + 7 * gridSettings.smallSqSize;
    const svgHeight = totalSqVertical * gridSettings.smallSqSize;
    const totalSvgWidth = svgWidth + liveChartSettings.marginForLabels;
    const totalSvgHeight = svgHeight + liveChartSettings.marginForSecTicks + liveChartSettings.marginFormVLabel;

    svg
        .attr('width', totalSvgWidth)
        .attr('height', totalSvgHeight)
        .attr('viewBox', `0 0 ${totalSvgWidth} ${totalSvgHeight}`)
        .attr('preserveAspectRatio', 'xMinYMin slice')
        .attr('shape-rendering', 'geometricPrecision')
        .attr('version', '2.0');


    // Scales
    const xScale = d3.scaleLinear()
        .domain([0, maxDisplayedValues - 1])
        .range([7 * gridSettings.smallSqSize, svgWidth]);
    const yScale = d3.scaleLinear()
        .domain([minValue, maxValue])
        .range([svgHeight - sqToExtendHeightBelowSignal * gridSettings.smallSqSize,
            sqToExtendHeightAboveSignal * gridSettings.smallSqSize]);


    // Background
    const bgGroup = svg.append('g').attr('class', 'bg');
    bgGroup.append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', totalSvgWidth)
        .attr('height', totalSvgHeight);


    // Chart content
    const chartContentGroup = svg.append('g')
        .attr('class', 'chart-content')
        .attr('transform',
            `translate(${liveChartSettings.marginForLabels}, ${liveChartSettings.marginFormVLabel})`);


    // Labels
    const labelsGroup = svg.append('g').attr('class', 'labels');
    const labelsLineWidth = 1.7;
    const labelsLineLength = 10;

    // y axis line
    labelsGroup.append('line')
        .attr('x1', liveChartSettings.marginForLabels)
        .attr('y1', liveChartSettings.marginFormVLabel - 20)
        .attr('x2', liveChartSettings.marginForLabels)
        .attr('y2', svgHeight + liveChartSettings.marginFormVLabel + labelsLineLength)
        .attr('stroke-width', labelsLineWidth);

    // x axis line
    labelsGroup.append('line')
        .attr('x1', liveChartSettings.marginForLabels - labelsLineLength)
        .attr('y1', svgHeight + liveChartSettings.marginFormVLabel)
        .attr('x2', totalSvgWidth)
        .attr('y2', svgHeight + liveChartSettings.marginFormVLabel)
        .attr('stroke-width', labelsLineWidth);

    // mV label
    labelsGroup.append('text')
        .attr('x', 10)
        .attr('y', 20)
        .attr('text-anchor', 'start')
        .attr('font-size', '12px')
        .text(`mV`);

    // top line
    labelsGroup.append('line')
        .attr('x1', liveChartSettings.marginForLabels)
        .attr('y1', liveChartSettings.marginFormVLabel)
        .attr('x2', totalSvgWidth)
        .attr('y2', liveChartSettings.marginFormVLabel)
        .attr('stroke-width', 1);


    // Grids
    const gridGroup = chartContentGroup.append('g').attr('class', 'grid-lines');

    // Vertical grid lines
    const verticalGridGroup = gridGroup.append('g').attr('class', 'vert-grid-lines');
    let counter = 0;
    let secValue = 0;
    for (let x = 0; x <= svgWidth; x += gridSettings.smallSqSize) {

        const isSec = (counter >= 7) && ((counter - 7) % 25 === 0);
        const isThick = isSec || ((counter - 2) % 5 === 0);

        verticalGridGroup.append('line')
            .attr('x1', x).attr('y1', 0)
            .attr('x2', x).attr('y2', svgHeight)
            .attr('class', isSec ? 'grid-thick-line' : 'grid-line')
            .attr('stroke-width', isThick ? lineSettings.thickLineWidth : lineSettings.thinLineWidth);

        if (isSec) {
            // sec tick
            labelsGroup.append('line')
                .attr('x1', x + liveChartSettings.marginForLabels)
                .attr('y1', totalSvgHeight - liveChartSettings.marginForSecTicks)
                .attr('x2', x + liveChartSettings.marginForLabels)
                .attr('y2', totalSvgHeight - liveChartSettings.marginForSecTicks + labelsLineLength)
                .attr('stroke-width', labelsLineWidth);

            // sec label
            labelsGroup.append('text')
                .attr('x', x + liveChartSettings.marginForLabels - 3)
                .attr('y', totalSvgHeight - liveChartSettings.marginForSecTicks + labelsLineLength + 15)
                .attr('text-anchor', 'start')
                .attr('font-size', '12px')
                .text(`${secValue}`);
            secValue++;
        }
        counter++;
    }

    // Horizontal grid lines
    const horizontalGridGroup = gridGroup.append('g').attr('class', 'hor-grid-lines');
    baselineY = yScale(baselineValue);

    // Horizontal grid lines above baseline
    counter = 0;
    let mVValue = 1;
    const horizontalGridAboveBaseline = horizontalGridGroup.append('g')
        .attr('class', 'hor-grid-above-baseline');
    for (let y = baselineY; y >= 0; y -= gridSettings.smallSqSize) {
        const isThick = counter % 5 === 0;
        const isMv = (counter % 10 === 0) && (y != baselineY);
        horizontalGridAboveBaseline.append('line')
            .attr('x1', 0).attr('y1', y)
            .attr('x2', svgWidth).attr('y2', y)
            .attr('class', isMv ? 'grid-thick-line' : 'grid-line')
            .attr('stroke-width', isThick ? lineSettings.thickLineWidth : lineSettings.thinLineWidth);

        if (isMv /*&& (y >= liveChartSettings.marginFormVLabel)*/) {
            // mV tick
            labelsGroup.append('line')
                .attr('x1', liveChartSettings.marginForLabels - labelsLineLength)
                .attr('y1', y + liveChartSettings.marginFormVLabel)
                .attr('x2', liveChartSettings.marginForLabels)
                .attr('y2', y + liveChartSettings.marginFormVLabel)
                .attr('stroke-width', labelsLineWidth);

            // mV label
            labelsGroup.append('text')
                .attr('x', 12)
                .attr('y', y + 3 + liveChartSettings.marginFormVLabel)
                .attr('text-anchor', 'start')
                .attr('font-size', '12px')
                .text(`${mVValue}`);
            mVValue++;
        }
        counter++;
    }

    // Horizontal grid lines below baseline
    counter = 0;
    mVValue = 0;
    const horizontalGridBelowBaseline = horizontalGridGroup.append('g').attr('class', 'hor-grid-below-baseline');
    for (let y = baselineY; y <= svgHeight; y += gridSettings.smallSqSize) {
        const isThick = counter % 5 === 0;
        const isMv = (counter % 10 === 0);
        horizontalGridBelowBaseline.append('line')
            .attr('x1', 0).attr('y1', y)
            .attr('x2', svgWidth).attr('y2', y)
            .attr('class', isMv ? 'grid-thick-line' : 'grid-line')
            .attr('stroke-width', isThick ? lineSettings.thickLineWidth : lineSettings.thinLineWidth);

        if (isMv) {
            labelsGroup.append('line')
                .attr('x1', liveChartSettings.marginForLabels - labelsLineLength)
                .attr('y1', y + liveChartSettings.marginFormVLabel)
                .attr('x2', liveChartSettings.marginForLabels)
                .attr('y2', y + liveChartSettings.marginFormVLabel)
                .attr('stroke-width', labelsLineWidth);

            labelsGroup.append('text')
                .attr('x', 12)
                .attr('y', y + 3 + liveChartSettings.marginFormVLabel)
                .attr('text-anchor', 'start')
                .attr('font-size', '12px')
                .text(`${mVValue}`);
            mVValue -= 1;
        }
        counter++;
    }


    // Red circle at start of middle segment
    if (isMiddleSegment) {
        chartContentGroup.append('circle')
            .attr('id', 'redCircle')
            .attr('cx', gridSettings.smallSqSize * 7 - 0.5)
            .attr('cy', baselineY)
            .attr('r', 10)
            .attr('fill-opacity', 0.7)
            .attr('stroke-width', 10);
    }


    // Signal
    const points = data.map((value, index) => `${xScale(index)},${yScale(value)}`).join(' ');
    const signalGroup = chartContentGroup.append('g').attr('class', 'ecg-signal');

    signalGroup.append('polyline')
        .attr('class', 'ecg-line')
        .attr('fill', 'none')
        .attr('stroke-width', lineSettings.signalLineWidth)
        .attr('points', points);


    // Rectangle
    var rectangleGroup = chartContentGroup.append('g')
        .attr('id', 'rectangle');

    var rectY = baselineY - 10 * gridSettings.smallSqSize;
    var rectWidth = 5 * gridSettings.smallSqSize;
    var rectHeight = 10 * gridSettings.smallSqSize;
    var rectLineWidth = 2.5;

    // Left line
    rectangleGroup.append('line')
        .attr('x1', 0)
        .attr('y1', baselineY)
        .attr('x2', gridSettings.smallSqSize)
        .attr('y2', baselineY)
        .attr('stroke-width', rectLineWidth);

    // Left side rectangle
    rectangleGroup.append('line')
        .attr('x1', gridSettings.smallSqSize)
        .attr('y1', rectY)
        .attr('x2', gridSettings.smallSqSize)
        .attr('y2', rectY + rectHeight)
        .attr('stroke-width', rectLineWidth);

    // Top side rectangle
    rectangleGroup.append('line')
        .attr('x1', gridSettings.smallSqSize)
        .attr('y1', rectY)
        .attr('x2', gridSettings.smallSqSize + rectWidth)
        .attr('y2', rectY)
        .attr('stroke-width', rectLineWidth);

    // Right side rectangle
    rectangleGroup.append('line')
        .attr('x1', gridSettings.smallSqSize + rectWidth)
        .attr('y1', rectY)
        .attr('x2', gridSettings.smallSqSize + rectWidth)
        .attr('y2', rectY + rectHeight)
        .attr('stroke-width', rectLineWidth);

    // Right line
    rectangleGroup.append('line')
        .attr('x1', gridSettings.smallSqSize + rectWidth)
        .attr('y1', baselineY)
        .attr('x2', rectWidth + gridSettings.smallSqSize * 2)
        .attr('y2', baselineY)
        .attr('stroke-width', rectLineWidth);


    // Timestamp
    chartContentGroup.append('text')
        .attr('id', 'timestamp')
        .attr('x', 7)  // Left margin
        .attr('y', 25)  // Top margin
        .attr('font-size', '18px')
        .text(segmentStartTime);
}