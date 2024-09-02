const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { DateTime } = require('luxon');
const { HttpsProxyAgent } = require('https-proxy-agent');

class Fintopio {
    constructor() {
        this.baseUrl = 'https://fintopio-tg.fintopio.com/api';
        this.headers = {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
            'Referer': 'https://fintopio-tg.fintopio.com/',
            'Sec-Ch-Ua': '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
            'Sec-Ch-Ua-Mobile': '?1',
            'Sec-Ch-Ua-Platform': '"Android"',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36'
        };
        this.proxies = [];
    }

    log(msg) {
        console.log(`[*] ${msg}`);
    }

    async waitWithCountdown(seconds) {
        for (let i = seconds; i >= 0; i--) {
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`===== Chờ ${i} giây để tiếp tục =====`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('');
    }

    async loadProxies() {
        const proxyFile = path.join(__dirname, 'proxy.txt');
        const proxyData = await fs.readFile(proxyFile, 'utf8');
        this.proxies = proxyData.split('\n').filter(Boolean);
    }

    async checkProxyIP(proxy) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', {
                httpsAgent: proxyAgent,
                timeout: 5000
            });
            if (response.status === 200) {
                return response.data.ip;
            } else {
                throw new Error(`Không thể kiểm tra IP của proxy. Status code: ${response.status}`);
            }
        } catch (error) {
            throw new Error(`Error khi kiểm tra IP của proxy: ${error.message}`);
        }
    }

    async makeRequest(method, url, options = {}, proxyIndex) {
        const proxy = this.proxies[proxyIndex];
        if (!proxy) {
            throw new Error('Không có proxy khả dụng');
        }

        const proxyAgent = new HttpsProxyAgent(proxy);
        try {
            const response = await axios({
                method,
                url,
                ...options,
                httpsAgent: proxyAgent,
                timeout: 10000
            });
            return response;
        } catch (error) {
            throw new Error(`Lỗi khi sử dụng proxy ${proxy}: ${error.message}`);
        }
    }

    async auth(userData, proxyIndex) {
        const url = `${this.baseUrl}/auth/telegram`;
        const headers = { ...this.headers, 'Webapp': 'true' };

        try {
            const response = await this.makeRequest('get', `${url}?${userData}`, { headers }, proxyIndex);
            return response.data.token;
        } catch (error) {
            this.log(`Lỗi khi xác thực: ${error.message}`.red);
            return null;
        }
    }

    async getProfile(token, proxyIndex) {
        const url = `${this.baseUrl}/referrals/data`;
        const headers = { 
            ...this.headers, 
            'Authorization': `Bearer ${token}`,
            'Webapp': 'false, true'
        };

        try {
            const response = await this.makeRequest('get', url, { headers }, proxyIndex);
            return response.data;
        } catch (error) {
            this.log(`Lỗi khi lấy thông tin profile: ${error.message}`.red);
            return null;
        }
    }

    async checkInDaily(token, proxyIndex) {
        const url = `${this.baseUrl}/daily-checkins`;
        const headers = {
            ...this.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        try {
            await this.makeRequest('post', url, { headers }, proxyIndex);
            this.log('Điểm danh hàng ngày thành công!'.green);
        } catch (error) {
            this.log(`Lỗi khi điểm danh hàng ngày: ${error.message}`.red);
        }
    }

    async getFarmingState(token, proxyIndex) {
        const url = `${this.baseUrl}/farming/state`;
        const headers = {
            ...this.headers,
            'Authorization': `Bearer ${token}`
        };

        try {
            const response = await this.makeRequest('get', url, { headers }, proxyIndex);
            return response.data;
        } catch (error) {
            this.log(`Lỗi khi lấy trạng thái farming: ${error.message}`.red);
            return null;
        }
    }

    async startFarming(token, proxyIndex) {
        const url = `${this.baseUrl}/farming/farm`;
        const headers = {
            ...this.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        try {
            const response = await this.makeRequest('post', url, { headers }, proxyIndex);
            const finishTimestamp = response.data.timings.finish;

            if (finishTimestamp) {
                const finishTime = DateTime.fromMillis(finishTimestamp).toLocaleString(DateTime.DATETIME_FULL);
                this.log(`Bắt đầu farm...`.yellow)
                this.log(`Thời gian hoàn thành farm: ${finishTime}`.green);
            } else {
                this.log('Không có thời gian hoàn thành.'.yellow);
            }
        } catch (error) {
            this.log(`Lỗi khi bắt đầu farming: ${error.message}`.red);
        }
    }

    async claimFarming(token, proxyIndex) {
        const url = `${this.baseUrl}/farming/claim`;
        const headers = {
            ...this.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        try {
            await this.makeRequest('post', url, { headers }, proxyIndex);
            this.log('Claim farm thành công!'.green);
        } catch (error) {
            this.log(`Lỗi khi claim: ${error.message}`.red);
        }
    }

    extractFirstName(userData) {
        try {
            const userPart = userData.match(/user=([^&]*)/)[1];
            const decodedUserPart = decodeURIComponent(userPart);
            const userObj = JSON.parse(decodedUserPart);
            return userObj.first_name || 'Unknown';
        } catch (error) {
            this.log(`Lỗi khi trích xuất first_name: ${error.message}`.red);
            return 'Unknown';
        }
    }

    calculateWaitTime(firstAccountFinishTime) {
        if (!firstAccountFinishTime) return null;
        
        const now = DateTime.now();
        const finishTime = DateTime.fromMillis(firstAccountFinishTime);
        const duration = finishTime.diff(now);
        
        return duration.as('milliseconds');
    }

    async main() {
        await this.loadProxies();
        while (true) {
            const dataFile = path.join(__dirname, 'data.txt');
            const data = await fs.readFile(dataFile, 'utf8');
            const users = data.split('\n').filter(Boolean);

            let firstAccountFinishTime = null;

            for (let i = 0; i < users.length; i++) {
                const userData = users[i];
                const first_name = this.extractFirstName(userData);
                let proxyIP = 'Unknown';
                try {
                    proxyIP = await this.checkProxyIP(this.proxies[i]);
                } catch (error) {
                    this.log(`Lỗi khi kiểm tra IP của proxy: ${error.message}`.red);
                }
                console.log(`========== Tài khoản ${i + 1} | ${first_name.green} | ip: ${proxyIP} ==========`);
                
                try {
                    const token = await this.auth(userData, i);
                    if (token) {
                        this.log(`Đăng nhập thành công!`.green);
                        const profile = await this.getProfile(token, i);
                        if (profile) {
                            const balance = profile.balance;
                            this.log(`Balance: ${balance.green}`);

                            await this.checkInDaily(token, i);

                            const farmingState = await this.getFarmingState(token, i);

                            if (farmingState) {
                                if (farmingState.state === 'idling') {
                                    await this.startFarming(token, i);
                                } else if (farmingState.state === 'farming') {
                                    const finishTimestamp = farmingState.timings.finish;
                                    if (finishTimestamp) {
                                        const finishTime = DateTime.fromMillis(finishTimestamp).toLocaleString(DateTime.DATETIME_FULL);
                                        this.log(`Thời gian hoàn thành farm: ${finishTime}`.green);

                                        if (i === 0) {
                                            firstAccountFinishTime = finishTimestamp;
                                        }

                                        const currentTime = DateTime.now().toMillis();
                                        if (currentTime > finishTimestamp) {
                                            await this.claimFarming(token, i);
                                            await this.startFarming(token, i);
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (error) {
                    this.log(`Lỗi khi xử lý tài khoản ${i + 1}: ${error.message}`.red);
                    continue; 
                }
            }

            const waitTime = this.calculateWaitTime(firstAccountFinishTime);
            if (waitTime && waitTime > 0) {
                await this.waitWithCountdown(Math.floor(waitTime / 1000));
            } else {
                this.log('Không có thời gian chờ hợp lệ, tiếp tục vòng lặp ngay lập tức.'.yellow);
                await this.waitWithCountdown(5);
            }
        }
    }
}

if (require.main === module) {
    const fintopio = new Fintopio();
    fintopio.main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}