const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { DateTime } = require('luxon');

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

    async auth(userData) {
        const url = `${this.baseUrl}/auth/telegram`;
        const headers = { ...this.headers, 'Webapp': 'true' };

        try {
            const response = await axios.get(`${url}?${userData}`, { headers });
            return response.data.token;
        } catch (error) {
            this.log(`Lỗi khi xác thực: ${error.message}`.red);
            return null;
        }
    }

    async getProfile(token) {
        const url = `${this.baseUrl}/referrals/data`;
        const headers = { 
            ...this.headers, 
            'Authorization': `Bearer ${token}`,
            'Webapp': 'false, true'
        };

        try {
            const response = await axios.get(url, { headers });
            return response.data;
        } catch (error) {
            this.log(`Lỗi khi lấy thông tin profile: ${error.message}`.red);
            return null;
        }
    }

    async checkInDaily(token) {
        const url = `${this.baseUrl}/daily-checkins`;
        const headers = {
            ...this.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        try {
            const response = await axios.post(url, {}, { headers });
            this.log('Điểm danh hàng ngày thành công!'.green);
        } catch (error) {
            this.log(`Lỗi khi điểm danh hàng ngày: ${error.message}`.red);
        }
    }

    async getFarmingState(token) {
        const url = `${this.baseUrl}/farming/state`;
        const headers = {
            ...this.headers,
            'Authorization': `Bearer ${token}`
        };

        try {
            const response = await axios.get(url, { headers });
            return response.data;
        } catch (error) {
            this.log(`Lỗi khi lấy trạng thái farming: ${error.message}`.red);
            return null;
        }
    }

    async startFarming(token) {
        const url = `${this.baseUrl}/farming/farm`;
        const headers = {
            ...this.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        try {
            const response = await axios.post(url, {}, { headers });
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

    async claimFarming(token) {
        const url = `${this.baseUrl}/farming/claim`;
        const headers = {
            ...this.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        try {
            await axios.post(url, {}, { headers });
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
        while (true) {
            const dataFile = path.join(__dirname, 'data.txt');
            const data = await fs.readFile(dataFile, 'utf8');
            const users = data.split('\n').filter(Boolean);

            let firstAccountFinishTime = null;

            for (let i = 0; i < users.length; i++) {
                const userData = users[i];
                const first_name = this.extractFirstName(userData);
                console.log(`========== Tài khoản ${i + 1} | ${first_name.green} ==========`);
                const token = await this.auth(userData);
                if (token) {
                    this.log(`Đăng nhập thành công!`.green);
                    const profile = await this.getProfile(token);
                    if (profile) {
                        const balance = profile.balance;
                        this.log(`Balance: ${balance.green}`);

                        await this.checkInDaily(token);

                        const farmingState = await this.getFarmingState(token);

                        if (farmingState) {
                            if (farmingState.state === 'idling') {
                                await this.startFarming(token);
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
                                        await this.claimFarming(token);
                                        await this.startFarming(token);
                                    }
                                }
                            }
                        }
                    }
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