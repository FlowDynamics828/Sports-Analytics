import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const DashboardComponent = () => {
    const [games, setGames] = useState([]);
    const [selectedLeague, setSelectedLeague] = useState('nba');
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetch(`/api/games/${selectedLeague}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    setGames(data);
                }
            } catch (error) {
                console.error('Error fetching data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedLeague]);

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Sports Analytics Dashboard</h1>
                <select 
                    value={selectedLeague}
                    onChange={(e) => setSelectedLeague(e.target.value)}
                    className="bg-gray-700 text-white p-2 rounded"
                >
                    <option value="nba">NBA</option>
                    <option value="nfl">NFL</option>
                    <option value="mlb">MLB</option>
                    <option value="nhl">NHL</option>
                </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Recent Games */}
                <Card className="col-span-full md:col-span-2">
                    <CardHeader>
                        <CardTitle>Recent Games</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {loading ? (
                                <div className="text-center">Loading...</div>
                            ) : games.length === 0 ? (
                                <div className="text-center">No recent games found</div>
                            ) : (
                                games.slice(0, 5).map((game, index) => (
                                    <div key={index} className="bg-gray-700 p-4 rounded hover:bg-gray-600 transition-colors">
                                        <div className="flex justify-between items-center">
                                            <div className="text-lg">
                                                <div className="font-bold">{game.homeTeam.name}</div>
                                                <div className="text-2xl">{game.homeTeam.score}</div>
                                            </div>
                                            <div className="text-gray-400 mx-4">VS</div>
                                            <div className="text-lg text-right">
                                                <div className="font-bold">{game.awayTeam.name}</div>
                                                <div className="text-2xl">{game.awayTeam.score}</div>
                                            </div>
                                        </div>
                                        <div className="text-sm text-gray-400 mt-2">
                                            {new Date(game.date).toLocaleDateString()}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Performance Chart */}
                <Card className="col-span-full">
                    <CardHeader>
                        <CardTitle>Team Performance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-96">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={games}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Line 
                                        type="monotone" 
                                        dataKey="homeTeam.score" 
                                        stroke="#8884d8" 
                                        name="Home Score"
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="awayTeam.score" 
                                        stroke="#82ca9d" 
                                        name="Away Score"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default DashboardComponent;