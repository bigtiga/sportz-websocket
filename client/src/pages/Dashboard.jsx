import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import axios from 'axios';

const Dashboard = () => {
  const { user, logout, token, API_URL } = useAuth();
  const [matches, setMatches] = useState([]);
  const [balance, setBalance] = useState(0);
  const [betHistory, setBetHistory] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [betAmount, setBetAmount] = useState('');
  const [betType, setBetType] = useState('homeWin');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [viewingMatch, setViewingMatch] = useState(null);
  const [activeTab, setActiveTab] = useState('matches');
  const [liveCommentary, setLiveCommentary] = useState([]);

  const { messages, isConnected, sendMessage } = useWebSocket(viewingMatch?.id);

  useEffect(() => {
    fetchMatches();
    fetchBalance();
    fetchBetHistory();
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.type === 'scoreUpdate' || lastMessage.type === 'newCommentary') {
        fetchMatches();
        if (lastMessage.type === 'newCommentary') {
          setLiveCommentary(prev => [...prev, lastMessage.data]);
        }
      }
    }
  }, [messages]);

  const fetchMatches = async () => {
    try {
      const response = await axios.get(`${API_URL}/matches`);
      setMatches(response.data);
    } catch (error) {
      console.error('Error fetching matches:', error);
    }
  };

  const fetchBalance = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/balance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBalance(response.data.balance);
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  const fetchBetHistory = async () => {
    try {
      const response = await axios.get(`${API_URL}/bets/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBetHistory(response.data.bets);
    } catch (error) {
      console.error('Error fetching bet history:', error);
    }
  };

  const placeBet = async (matchId) => {
    if (!betAmount || betAmount <= 0) {
      setMessage('Please enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/bets/place`,
        {
          matchId,
          betType,
          amount: parseFloat(betAmount),
          odds: 2.5
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      setMessage(`✅ Bet placed successfully! New balance: $${response.data.newBalance}`);
      setBetAmount('');
      fetchBalance();
      fetchBetHistory();
    } catch (error) {
      setMessage(`❌ ${error.response?.data?.error || 'Failed to place bet'}`);
    }
    setLoading(false);
  };

  const getMatchStatusColor = (status) => {
    switch(status) {
      case 'live': return '#22c55e';
      case 'finished': return '#6b7280';
      default: return '#eab308';
    }
  };

  const getMatchStatusText = (status) => {
    switch(status) {
      case 'live': return '● LIVE';
      case 'finished': return 'FINISHED';
      default: return 'SCHEDULED';
    }
  };

  const handleWatchLive = (match) => {
    setViewingMatch(match);
    setLiveCommentary([]);
    if (sendMessage) {
      sendMessage({ type: 'subscribeMatch', matchId: match.id });
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f2f5', fontFamily: 'Arial, sans-serif' }}>
      {/* Navbar */}
      <nav style={{ 
        backgroundColor: '#ffffff', 
        color: '#1a1a2e', 
        padding: '0 24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        borderBottom: '1px solid #e8eaed',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ 
          maxWidth: '1400px', 
          margin: '0 auto', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          height: '64px'
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px' }}>⚽</span>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1a1a2e' }}>Sportz</h1>
          </div>

          {/* Nav Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <button
              onClick={() => setActiveTab('matches')}
              style={{
                fontSize: '14px',
                fontWeight: activeTab === 'matches' ? '600' : '400',
                color: activeTab === 'matches' ? '#3b82f6' : '#6b7280',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px 4px',
                borderBottom: activeTab === 'matches' ? '2px solid #3b82f6' : '2px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              📋 Matches
            </button>
            <button
              onClick={() => setActiveTab('bets')}
              style={{
                fontSize: '14px',
                fontWeight: activeTab === 'bets' ? '600' : '400',
                color: activeTab === 'bets' ? '#3b82f6' : '#6b7280',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px 4px',
                borderBottom: activeTab === 'bets' ? '2px solid #3b82f6' : '2px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              💰 My Bets
            </button>
            <button
              onClick={() => setActiveTab('live')}
              style={{
                fontSize: '14px',
                fontWeight: activeTab === 'live' ? '600' : '400',
                color: activeTab === 'live' ? '#3b82f6' : '#6b7280',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px 4px',
                borderBottom: activeTab === 'live' ? '2px solid #3b82f6' : '2px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              📺 Live
            </button>
          </div>

          {/* User Section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              backgroundColor: '#f0fdf4',
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1px solid #bbf7d0'
            }}>
              <span style={{ fontSize: '14px' }}>💰</span>
              <span style={{ fontWeight: '600', color: '#16a34a' }}>${balance}</span>
            </div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              backgroundColor: '#eff6ff',
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1px solid #bfdbfe'
            }}>
              <span style={{ fontSize: '14px' }}>👤</span>
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a2e' }}>{user?.username}</span>
            </div>
            <button 
              onClick={logout}
              style={{
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                padding: '6px 16px',
                borderRadius: '20px',
                border: '1px solid #fca5a5',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#fecaca';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#fee2e2';
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px 24px' }}>
        {/* WebSocket Status */}
        <div style={{ 
          marginBottom: '16px', 
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: '#ffffff',
          padding: '6px 16px',
          borderRadius: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          width: 'fit-content'
        }}>
          <span style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isConnected ? '#22c55e' : '#ef4444'
          }}></span>
          <span style={{ color: '#6b7280' }}>
            {isConnected ? '🟢 Live Updates Active' : '🔴 Reconnecting...'}
          </span>
          {viewingMatch && (
            <span style={{ color: '#6b7280', marginLeft: '12px' }}>
              📺 Watching: {viewingMatch.homeTeam} vs {viewingMatch.awayTeam}
            </span>
          )}
        </div>

        {/* Messages */}
        {message && (
          <div style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: message.includes('❌') ? '#fee2e2' : '#dcfce7',
            color: message.includes('❌') ? '#dc2626' : '#16a34a',
            border: `1px solid ${message.includes('❌') ? '#fca5a5' : '#bbf7d0'}`
          }}>
            {message}
          </div>
        )}

        {/* Main Content */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px'
        }}>
          {/* Left Column */}
          <div>
            {activeTab === 'matches' && (
              <>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px'
                }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1a1a2e' }}>📋 All Matches</h2>
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>{matches.length} matches</span>
                </div>

                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  maxHeight: '600px',
                  overflowY: 'auto',
                  paddingRight: '4px'
                }}>
                  {matches.map((match) => (
                    <div key={match.id} style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '10px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      padding: '14px 16px',
                      border: viewingMatch?.id === match.id ? '2px solid #3b82f6' : '1px solid #e8eaed'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <span style={{
                          padding: '2px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600',
                          color: 'white',
                          backgroundColor: getMatchStatusColor(match.status)
                        }}>
                          {getMatchStatusText(match.status)}
                        </span>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>{match.sport}</span>
                      </div>
                      <div style={{ textAlign: 'center', padding: '6px 0' }}>
                        <div style={{ fontWeight: '600', fontSize: '15px', color: '#1a1a2e' }}>{match.homeTeam}</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', margin: '4px 0', color: '#1a1a2e' }}>
                          {match.homeScore} - {match.awayScore}
                        </div>
                        <div style={{ fontWeight: '600', fontSize: '15px', color: '#1a1a2e' }}>{match.awayTeam}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f0f2f5' }}>
                        <button
                          onClick={() => handleWatchLive(match)}
                          style={{
                            flex: 1,
                            backgroundColor: '#eff6ff',
                            color: '#3b82f6',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid #bfdbfe',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '500'
                          }}
                        >
                          👁️ Watch Live
                        </button>
                        <button
                          onClick={() => { setSelectedMatch(match); setBetType('homeWin'); }}
                          style={{
                            flex: 1,
                            backgroundColor: '#f0fdf4',
                            color: '#16a34a',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid #bbf7d0',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '500'
                          }}
                        >
                          💰 Bet
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab === 'bets' && (
              <>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1a1a2e', marginBottom: '16px' }}>💰 My Bet History</h2>
                {betHistory.length === 0 ? (
                  <div style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '10px',
                    padding: '40px',
                    textAlign: 'center',
                    color: '#6b7280',
                    fontSize: '14px',
                    border: '1px solid #e8eaed'
                  }}>
                    No bets placed yet. Start betting on matches!
                  </div>
                ) : (
                  <div style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '10px',
                    border: '1px solid #e8eaed',
                    overflow: 'hidden'
                  }}>
                    {betHistory.map((bet) => (
                      <div key={bet.id} style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #f0f2f5',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div>
                          <div style={{ fontWeight: '500', fontSize: '14px' }}>
                            {bet.match?.homeTeam} vs {bet.match?.awayTeam}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                            {bet.betType} • ${bet.amount} @ {bet.odds}x
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{
                            padding: '2px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: '600',
                            color: 'white',
                            backgroundColor: bet.status === 'won' ? '#22c55e' :
                              bet.status === 'lost' ? '#ef4444' :
                              '#eab308'
                          }}>
                            {bet.status}
                          </span>
                          {bet.status === 'won' && (
                            <span style={{ color: '#22c55e', fontWeight: '600' }}>
                              +${bet.potentialWinnings}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'live' && (
              <>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1a1a2e', marginBottom: '16px' }}>📺 Live Matches</h2>
                {matches.filter(m => m.status === 'live').length === 0 ? (
                  <div style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '10px',
                    padding: '40px',
                    textAlign: 'center',
                    color: '#6b7280',
                    fontSize: '14px',
                    border: '1px solid #e8eaed'
                  }}>
                    No live matches at the moment
                  </div>
                ) : (
                  matches.filter(m => m.status === 'live').map((match) => (
                    <div key={match.id} style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '10px',
                      padding: '16px',
                      border: '2px solid #22c55e',
                      marginBottom: '12px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ color: '#22c55e', fontWeight: '600', fontSize: '14px' }}>🔴 LIVE</span>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>{match.sport}</span>
                      </div>
                      <div style={{ textAlign: 'center', padding: '8px 0' }}>
                        <div style={{ fontWeight: '600', fontSize: '16px' }}>{match.homeTeam}</div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', margin: '4px 0' }}>
                          {match.homeScore} - {match.awayScore}
                        </div>
                        <div style={{ fontWeight: '600', fontSize: '16px' }}>{match.awayTeam}</div>
                      </div>
                      <button
                        onClick={() => handleWatchLive(match)}
                        style={{
                          width: '100%',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '8px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: '500',
                          marginTop: '8px'
                        }}
                      >
                        Watch Live
                      </button>
                    </div>
                  ))
                )}
              </>
            )}
          </div>

          {/* Right Column - Live Match Viewer / Betting Panel */}
          <div>
            {viewingMatch ? (
              // Live Match Viewer
              <div style={{
                backgroundColor: '#ffffff',
                borderRadius: '10px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                border: '1px solid #e8eaed',
                overflow: 'hidden'
              }}>
                <div style={{
                  backgroundColor: '#f8fafc',
                  padding: '12px 16px',
                  borderBottom: '1px solid #e8eaed',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1a1a2e' }}>
                    📺 {viewingMatch.homeTeam} vs {viewingMatch.awayTeam}
                  </h3>
                  <button
                    onClick={() => { setViewingMatch(null); setLiveCommentary([]); }}
                    style={{
                      backgroundColor: '#f3f4f6',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 12px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#6b7280'
                    }}
                  >
                    ✕ Close
                  </button>
                </div>

                {/* Score Display */}
                <div style={{
                  textAlign: 'center',
                  padding: '20px',
                  backgroundColor: '#fafbfc'
                }}>
                  <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
                    {getMatchStatusText(viewingMatch.status)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '24px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a2e' }}>{viewingMatch.homeTeam}</div>
                      <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#3b82f6' }}>{viewingMatch.homeScore}</div>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#6b7280' }}>VS</div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a2e' }}>{viewingMatch.awayTeam}</div>
                      <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ef4444' }}>{viewingMatch.awayScore}</div>
                    </div>
                  </div>
                </div>

                {/* Live Commentary */}
                <div style={{ padding: '12px 16px', maxHeight: '150px', overflowY: 'auto' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '8px' }}>Live Commentary</h4>
                  {liveCommentary.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#6b7280', fontStyle: 'italic' }}>
                      Waiting for live updates...
                    </p>
                  ) : (
                    liveCommentary.slice(-5).reverse().map((comment, idx) => (
                      <div key={idx} style={{
                        padding: '4px 8px',
                        backgroundColor: '#f8fafc',
                        borderRadius: '4px',
                        marginBottom: '4px',
                        fontSize: '13px',
                        borderLeft: '3px solid #3b82f6'
                      }}>
                        <span style={{ fontWeight: '500' }}>{comment.minute}'</span> - {comment.message}
                      </div>
                    ))
                  )}
                </div>

                {/* Betting Section */}
                {viewingMatch.status !== 'finished' && (
                  <div style={{ padding: '16px', borderTop: '1px solid #e8eaed' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px' }}>Place a Bet</h4>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <button
                        onClick={() => setBetType('homeWin')}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid',
                          cursor: 'pointer',
                          fontSize: '12px',
                          backgroundColor: betType === 'homeWin' ? '#3b82f6' : '#f8fafc',
                          color: betType === 'homeWin' ? 'white' : '#1a1a2e',
                          borderColor: betType === 'homeWin' ? '#3b82f6' : '#d1d5db'
                        }}
                      >
                        {viewingMatch.homeTeam}
                      </button>
                      <button
                        onClick={() => setBetType('draw')}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid',
                          cursor: 'pointer',
                          fontSize: '12px',
                          backgroundColor: betType === 'draw' ? '#6b7280' : '#f8fafc',
                          color: betType === 'draw' ? 'white' : '#1a1a2e',
                          borderColor: betType === 'draw' ? '#6b7280' : '#d1d5db'
                        }}
                      >
                        Draw
                      </button>
                      <button
                        onClick={() => setBetType('awayWin')}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid',
                          cursor: 'pointer',
                          fontSize: '12px',
                          backgroundColor: betType === 'awayWin' ? '#3b82f6' : '#f8fafc',
                          color: betType === 'awayWin' ? 'white' : '#1a1a2e',
                          borderColor: betType === 'awayWin' ? '#3b82f6' : '#d1d5db'
                        }}
                      >
                        {viewingMatch.awayTeam}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="number"
                        placeholder="Enter amount"
                        value={betAmount}
                        onChange={(e) => setBetAmount(e.target.value)}
                        style={{
                          flex: 1,
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          fontSize: '14px',
                          outline: 'none'
                        }}
                        min="1"
                      />
                      <button
                        onClick={() => placeBet(viewingMatch.id)}
                        disabled={loading}
                        style={{
                          backgroundColor: '#22c55e',
                          color: 'white',
                          padding: '8px 24px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: '500',
                          opacity: loading ? 0.5 : 1
                        }}
                      >
                        {loading ? '...' : 'Bet'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // No match selected
              <div style={{
                backgroundColor: '#ffffff',
                borderRadius: '10px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                padding: '40px',
                border: '1px solid #e8eaed',
                textAlign: 'center',
                minHeight: '500px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '56px', marginBottom: '16px' }}>📺</span>
                <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1a1a2e', marginBottom: '8px' }}>
                  Select a Match to Watch
                </h3>
                <p style={{ fontSize: '14px', color: '#6b7280', maxWidth: '320px' }}>
                  Click on "Watch Live" on any match to view live scores and commentary
                </p>
                <div style={{
                  marginTop: '20px',
                  padding: '12px 24px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#6b7280'
                }}>
                  💰 Balance: ${balance}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
