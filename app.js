const views = {
    songs: {
      json: "data/songs.json",
      sort: { field: "date", direction: "desc" },
      group: { field: "album", direction: "asc" },
      mainImage: "cover_image",
      primaryHeader: "title",
      secondaryHeader: "artist",
      summary: "plays",
      url: "spotify_url"
    }
  };

  function detectType(fieldName, value) {
    if (fieldName.toLowerCase().includes("image")) return "image";
  
    if (/^\d+$/.test(value)) return "number";
  
    if (typeof value === "string" && value.startsWith("http"))
      return "url";
  
    return "text";
  }

  function formatValue(type, value) {
    switch (type) {
      case "number":
        return Number(value).toLocaleString();
      case "url":
        return `<span class="link-icon" title="${value}">🔗</span>`;
      case "image":
        return `<img src="${value}" class="deck-image"/>`;
      default:
        return value;
    }
  }

  function renderDeck(items, config) {
    const container = document.getElementById("view");
  
    const previewItems = items.slice(0, 5);
  
    container.innerHTML = previewItems.map(item =>
      renderCard(item, config)
    ).join("");
  
    container.innerHTML += `
      <button onclick="renderFullList()">View All</button>
    `;
  }

  function renderCard(item, config) {
    return `
      <div class="card">
        ${config.mainImage ? `<img src="${item[config.mainImage]}" />` : ""}
  
        <div class="card-content">
          <div class="primary">${item[config.primaryHeader] || ""}</div>
          <div class="secondary">${item[config.secondaryHeader] || ""}</div>
          <div class="summary">${formatSummary(item, config)}</div>
          <div class="url">${formatUrl(item, config)}</div>
        </div>
      </div>
    `;
  }

  function sortData(data, sortConfig) {
    if (!sortConfig) return data;
  
    return [...data].sort((a, b) => {
      const valA = a[sortConfig.field];
      const valB = b[sortConfig.field];
  
      return sortConfig.direction === "asc"
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA);
    });
  }

  function groupData(data, groupConfig) {
    if (!groupConfig) return data;
  
    const groups = {};
  
    data.forEach(item => {
      const key = item[groupConfig.field] || "Other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
  
    return Object.entries(groups)
      .map(([key, items]) => ({
        group: key,
        count: items.length,
        items
      }))
      .sort((a, b) =>
        groupConfig.direction === "asc"
          ? a.group.localeCompare(b.group)
          : b.group.localeCompare(a.group)
      );
  }

  function showDetail(item) {
    document.getElementById("view").innerHTML = `
      <div class="detail">
        ${Object.entries(item).map(([key, value]) => {
          const type = detectType(key, value);
  
          if (type === "url") {
            return `<div><b>${key}</b>: <a href="${value}" target="_blank">${value}</a></div>`;
          }
  
          if (type === "image") {
            return `<img src="${value}" />`;
          }
  
          return `<div><b>${key}</b>: ${formatValue(type, value)}</div>`;
        }).join("")}
      </div>
    `;
  }

  