var Service, Characteristic;
var Denon = require('./lib/aquos');
var inherits = require('util').inherits;
var pollingtoevent = require('polling-to-event');


module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory('homebridge-sharp', 'SharpTV', SharpTVAccessory);
};

function SharpTVAccessory(log, config) {
    this.log = log;
	var that = this;
	
    this.config = config;
    this.ip = config['ip'] || '10.19.27.220';
    this.name = config['name'] || 'test';
    this.port = config['port'] || 10002;
    this.username = config['username'] || 'a';
    this.password = config['password'] || 'a';

    this.defaultInput = config['defaultInput'] || null;
    this.defaultVolume = config['defaultVolume'] || null;
    this.minVolume = config['minVolume'] || 0;
    this.maxVolume = config['maxVolume'] || 60;
	this.doPolling = config['doPolling'] || false;
	
	this.pollingInterval = config['pollingInterval'] || "60";
	this.pollingInterval = parseInt(this.pollingInterval)

    this.aquos = new Aquos(this.ip, this.port, this.username, this.password);
	
	this.setAttempt = 0;
	this.state = false;
	if (this.interval < 10 && this.interval > 100000) {
		this.log("polling interval out of range.. disabled polling");
		this.doPolling = false;
	}

	// Status Polling
	if (this.doPolling) {
		that.log("start polling..");
		var statusemitter = pollingtoevent(function(done) {
			that.log("do poll..")
			that.getPowerState( function( error, response) {
				done(error, response, this.setAttempt);
			}, "statuspoll");
		}, {longpolling:true,interval:that.pollingInterval * 1000,longpollEventName:"statuspoll"});

		statusemitter.on("statuspoll", function(data) {
			that.state = data;
			that.log("poll end, state: "+data);
			
			if (that.switchService ) {
				that.switchService.getCharacteristic(Characteristic.On).updateValue(that.state, null, "statuspoll");
			}
		});
	}
}


SharpTVAccessory.prototype.getPowerState = function (callback, context) {
	
	if ((!context || context != "statuspoll") && this.doPolling) {
		callback(null, this.state);
	} else {
	    this.aquos.power(function (err, state) {
	        if (err) {
	            this.log(err);
	            callback(null, false);
	        } else {
				this.log('current power state is: %s', (state) ? 'ON' : 'OFF');
				callback(null, state);
	        }
	    }.bind(this));
	}
};

SharpTVAccessory.prototype.setPowerState = function (powerState, callback, context) {
	var that = this;

	//if context is statuspoll, then we need to ensure that we do not set the actual value
	if (context && context == "statuspoll") {
		callback(null, powerState);
	    return;
	}
	
	this.setAttempt = this.setAttempt+1;
	
    this.aquos.power(powerState, function (err, state) {
        if (err) {
            this.log(err);
        } else {
            if(powerState && this.defaultInput) {
                this.aquos.setInput(this.defaultInput, function (error) {
                    if (error) {
                        this.log('Error setting default input. Please check your config');
                    }
                }.bind(this));
            }
            this.log('Sharp TV powered %s', state);
        }
    }.bind(this));

    if (powerState && this.defaultVolume) {
        setTimeout(function () {
            this.aquos.volume(this.defaultVolume, function (err) {
                if (err) {
                    this.log('Error setting default volume');
                }
                this.switchService.getCharacteristic(Characteristic.Volume)
                  .updateValue(Math.round(this.defaultVolume / this.maxVolume * 100));
            }.bind(this));
        }.bind(this), 4000);
    }
    callback(null);
};

SharpTVAccessory.prototype.getVolume = function (callback) {
    this.aquos.volume(function (err, volume) {
        if (err) {
            this.log('get Volume error: ' + err)
            callback(err);
        } else {
            this.log('current volume is: ' + volume);
            var pVol = Math.round(volume / this.maxVolume * 100);
            callback(null, pVol);
        }
    }.bind(this))
};

SharpTVAccessory.prototype.setVolume = function (pVol, callback) {
    var volume = Math.round(pVol / 100 * this.maxVolume);
    this.aquos.volume(volume, function (err) {
        if (err) {
            this.log('set Volume error: ' + err);
        } else {
            this.log('set Volume to: ' + volume);
            callback(null);
        }
    }.bind(this))
};

SharpTVAccessory.prototype.setMuteState = function (state, callback) {
    this.aquos.mute(state, function (err) {
        if (err) {
            this.log('set mute error: ' + err);
            callback(err);
        } else {
            callback(null);
        }
    }.bind(this));
};

SharpTVAccessory.prototype.getMuteState = function (callback) {
    this.aquos.mute(function (err, state) {
        if (err) {
            this.log('get mute error: ' + err);
            callback(err);
        } else {
            callback(state);
        }
    }.bind(this))
};

SharpTVAccessory.prototype.getServices = function () {
    var informationService = new Service.AccessoryInformation();

    informationService
        .setCharacteristic(Characteristic.Name, this.name)
        .setCharacteristic(Characteristic.Manufacturer, this.type || 'Sharp');

    this.switchService = new Service.Switch(this.name);
    this.switchService.getCharacteristic(Characteristic.On)
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this));

    this.switchService.addCharacteristic(Characteristic.Mute)
        .on('get', this.getMuteState.bind(this))
        .on('set', this.setMuteState.bind(this));

    this.switchService.addCharacteristic(Characteristic.Volume)
        .on('get', this.getVolume.bind(this))
        .on('set', this.setVolume.bind(this));

    return [informationService, this.switchService];
};
