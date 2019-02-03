class TileManager {
  constructor(trackObj, dataFetcher) {
    this.visibleTiles = new Set();
    this.renderingTiles = new Set();
    this.fetching = new Set();
    this.fetchedTiles = {};
    this.trackObj = trackObj;
    this.dataFetcher = dataFetcher;
    this.listeners = {};
  }

  /**
   * Return the set of ids of all tiles which are both visible and fetched.
   */
  visibleAndFetchedIds() {
    return Object.keys(this.fetchedTiles).filter(x => this.visibleTileIds.has(x));
  }

  /**
   * Which tiles have both been fetched and are visible?
   */
  visibleAndFetchedTiles() {
    return this.visibleAndFetchedIds().map(x => this.fetchedTiles[x]);
  }

  /**
   * Set which tiles are visible right now.
   *
   * @param tiles: A set of tiles which will be considered the currently visible
   * tile positions.
   */
  setVisibleTiles(tilePositions) {
    this.visibleTiles = tilePositions.map(x => ({
      tileId: this.tileToLocalId(x),
      remoteId: this.tileToRemoteId(x),
      mirrored: x.mirrored,
    }));

    this.visibleTileIds = new Set(this.visibleTiles.map(x => x.tileId));
  }

  removeOldTiles() {
    const visibleTileIds = this.trackObj.calculateVisibleTileIds();

    // tiles that are fetched
    const fetchedTileIDs = new Set(Object.keys(this.fetchedTiles));
    //
    // calculate which tiles are obsolete and remove them
    // fetchedTileID are remote ids
    const toRemove = [...fetchedTileIDs].filter(x => !visibleTileIds.has(x));

    this.removeTiles(toRemove);
  }

  /**
   * See if we need to fetch new tiles or remove old ones.
   */
  refreshTiles() {
    const visibleTiles = this.trackObj.calculateVisibleTiles();
    this.visibleTiles = visibleTiles;
    this.visibleTileIds = new Set(this.visibleTiles.map(x => x.tileId));

    // tiles that are fetched
    const fetchedTileIDs = new Set(Object.keys(this.fetchedTiles));

    // fetch the tiles that should be visible but haven't been fetched
    // and aren't in the process of being fetched
    const toFetch = [...visibleTiles]
      .filter(x => !this.fetching.has(x.remoteId) && !fetchedTileIDs.has(x.tileId));

    for (let i = 0; i < toFetch.length; i++) {
      this.fetching.add(toFetch[i].remoteId);
    }

    this.removeOldTiles();
    this.fetchNewTiles(toFetch);
  }

  parentInFetched(tile) {
    const uid = tile.tileData.tilesetUid;
    let zl = tile.tileData.zoomLevel;
    let pos = tile.tileData.tilePos;

    while (zl > 0) {
      zl -= 1;
      pos = pos.map(x => Math.floor(x / 2));

      const parentId = `${uid}.${zl}.${pos.join('.')}`;
      if (parentId in this.fetchedTiles) { return true; }
    }

    return false;
  }

  parentTileId(tile) {
    const parentZoomLevel = tile.tileData.zoomLevel - 1;
    const parentPos = tile.tileData.tilePos.map(x => Math.floor(x / 2));
    const parentUid = tile.tileData.tilesetUid;

    return `${parentUid}.${parentZoomLevel}.${parentPos.join('.')}`;
  }

  /**
   * Remove obsolete tiles
   *
   * @param toRemoveIds: An array of tile ids to remove from the list of fetched tiles.
   */
  removeTiles(toRemoveIds) {
    // if there's nothing to remove, don't bother doing anything
    if (
      !toRemoveIds.length || !this.areAllVisibleTilesLoaded() || this.renderingTiles.size
    ) {
      return;
    }

    // console.log('removing:', toRemoveIds);

    toRemoveIds.forEach((x) => {
      const tileIdStr = x;
      this.destroyTile(this.fetchedTiles[tileIdStr]);

      if (tileIdStr in this.tileGraphics) {
        this.pMain.removeChild(this.tileGraphics[tileIdStr]);
        delete this.tileGraphics[tileIdStr];
      } else {
        // console.log('tileIdStr absent:', tileIdStr);
      }

      delete this.fetchedTiles[tileIdStr];
    });


    this.synchronizeTilesAndGraphics();
    this.trackObj.draw();

    // console.log('# children', this.pMain.children.length, Object.keys(this.fetchedTiles).length);
  }

  /**
   * Check to see if all the visible tiles are loaded.
   *
   * If they are, remove all other tiles.
   */
  areAllVisibleTilesLoaded() {
    // tiles that are fetched
    const fetchedTileIDs = new Set(Object.keys(this.fetchedTiles));

    const visibleTileIdsList = [...this.visibleTileIds];

    for (let i = 0; i < visibleTileIdsList.length; i++) {
      if (!fetchedTileIDs.has(visibleTileIdsList[i])) { return false; }
    }

    return true;
  }

  addMissingGraphics() {
    /**
         * Add graphics for tiles that have no graphics
         */
    const fetchedTileIDs = Object.keys(this.fetchedTiles);
    this.renderVersion += 1;

    for (let i = 0; i < fetchedTileIDs.length; i++) {
      if (!this.trackObj.tileLoaded(fetchedTileIDs[i])) {
        this.trackObj.initTile(
          this.fetchedTiles[fetchedTileIDs[i]]
        );
      }
    }
  }

  /**
   * Change the graphics for existing tiles
   */
  updateExistingGraphics() {
    const fetchedTileIDs = Object.keys(this.fetchedTiles);

    for (let i = 0; i < fetchedTileIDs.length; i++) {
      this.trackObj.updateTile(this.fetchedTiles[fetchedTileIDs[i]]);
    }
  }

  synchronizeTilesAndGraphics() {
    /**
     * Make sure that we have a one to one mapping between tiles
     * and graphics objects
     *
     */

    // keep track of which tiles are visible at the moment
    this.addMissingGraphics();
    this.removeOldTiles();
    this.updateExistingGraphics();

    if (this.listeners.dataChanged) {
      for (const callback of this.listeners.dataChanged) {
        callback(this.visibleAndFetchedTiles().map(x => x.tileData));
      }
    }
  }

  /**
   * Retrieve a new set of tiles from the server.
   *
   * @param  {array} toFetch The numbers of the tiles to fetch
   *                         (e.g. [5, 10])
   */
  fetchNewTiles(toFetch) {
    if (toFetch.length > 0) {
      const toFetchList = [...(new Set(toFetch.map(x => x.remoteId)))];

      this.dataFetcher.fetchTilesDebounced(
        this.receivedTiles.bind(this),
        toFetchList
      );
    }
  }

  /**
   * We've gotten a bunch of tiles from the server in
   * response to a request from fetchTiles.
   */
  receivedTiles(loadedTiles) {
    for (let i = 0; i < this.visibleTiles.length; i++) {
      const { tileId } = this.visibleTiles[i];

      if (!loadedTiles[this.visibleTiles[i].remoteId]) { continue; }


      if (this.visibleTiles[i].remoteId in loadedTiles) {
        if (!(tileId in this.fetchedTiles)) {
          // this tile may have graphics associated with it
          this.fetchedTiles[tileId] = this.visibleTiles[i];
        }


        this.fetchedTiles[tileId].tileData = loadedTiles[this.visibleTiles[i].remoteId];

        if (this.fetchedTiles[tileId].tileData.error) {
          console.warn('Error in loaded tile', tileId, this.fetchedTiles[tileId].tileData);
        }
      }
    }

    // const fetchedTileIDs = new Set(Object.keys(this.fetchedTiles));
    // console.log('fetchedTileIDs:', fetchedTileIDs);
    // console.log('fetching:', this.fetching);

    for (const key in loadedTiles) {
      if (loadedTiles[key]) {
        const tileId = loadedTiles[key].tilePositionId;
        // console.log('tileId:', tileId, 'fetching:', this.fetching);

        if (this.fetching.has(tileId)) {
          // console.log('removing:', tileId, 'fetching:', this.fetching);
          this.fetching.delete(tileId);
        }
      }
    }


    /*
         * Mainly called to remove old unnecessary tiles
         */
    this.synchronizeTilesAndGraphics();

    // we need to draw when we receive new data
    this.trackObj.draw();
    if (this.trackObj.drawLabel) {
      this.drawLabel(); // update the current zoom level
    }

    // Let HiGlass know we need to re-render
    // check if the value scale has changed
    if (this.valueScale) {
      if (!this.prevValueScale
        || JSON.stringify(this.valueScale.domain())
        !== JSON.stringify(this.prevValueScale.domain())) {
        // console.log('here', this.onValueScaleChanged);
        // if (this.prevValueScale)
        // console.log('this.prevValueScale.domain()', this.prevValueScale.domain());
        // console.log('this.valueScale.domain()', this.valueScale.domain());
        this.prevValueScale = this.valueScale.copy();

        if (this.onValueScaleChanged) {
          // this is used to synchronize tracks with locked value scales
          this.onValueScaleChanged();
        }
      }
    }

    if (this.trackObj.animate) {
      this.trackObj.animate();
    }

    // 1. Check if all visible tiles are loaded
    // 2. If `true` then send out event
    if (this.trackObj.areAllVisibleTilesLoaded
      && this.trackObj.areAllVisibleTilesLoaded()) {
      this.pubSub.publish('TiledPixiTrack.tilesLoaded', { uuid: this.uuid });
    }
  }

  /**
   * Register an event listener for track events. Currently, the only supported
   * event is ``dataChanged``.
   *
   * @param {string} event The event to listen for
   * @param {function} callback The callback to call when the event occurs. The
   *  parameters for the event depend on the event called.
   *
   * @example
   *
   * ..code-block::
   *
   *  trackObj.on('dataChanged', (newData) => {
   *   console.log('newData:', newData)
   *  });
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }

    this.listeners[event].push(callback);
  }

  off(event, callback) {
    const id = this.listeners[event].indexOf(callback);
    if (id === -1 || id >= this.listeners[event].length) return;

    this.listeners[event].splice(id, 1);
  }
}

export default TileManager;
